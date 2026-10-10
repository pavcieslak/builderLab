<?php
/**
 * Navigation block: use a menu made in WordPress (classic menus, or block theme navigation).
 * A menu is chosen as "menu:ID" (classic) or "nav:ID" (block theme navigation). Empty means the links typed in the block.
 */
defined( 'ABSPATH' ) || exit;

/** Menus that can be chosen, grouped by kind. */
function builderlab_nav_menus() {
	$out = array( 'menus' => array(), 'navigations' => array() );
	foreach ( wp_get_nav_menus() as $menu ) {
		$out['menus'][] = array( 'value' => 'menu:' . $menu->term_id, 'label' => $menu->name );
	}
	$posts = get_posts( array( 'post_type' => 'wp_navigation', 'post_status' => 'publish', 'numberposts' => 50, 'orderby' => 'title', 'order' => 'ASC' ) );
	foreach ( $posts as $post ) {
		$out['navigations'][] = array( 'value' => 'nav:' . $post->ID, 'label' => '' !== trim( $post->post_title ) ? $post->post_title : 'Navigation ' . $post->ID );
	}
	return $out;
}

/** The chosen menu as a tree of label, url and children (one level of children). */
function builderlab_nav_tree( $choice ) {
	if ( ! preg_match( '/^(menu|nav):(\d+)$/', (string) $choice, $m ) ) {
		return array();
	}
	return 'menu' === $m[1] ? builderlab_nav_tree_classic( (int) $m[2] ) : builderlab_nav_tree_blocks( (int) $m[2] );
}

function builderlab_nav_tree_classic( $menu_id ) {
	$items = wp_get_nav_menu_items( $menu_id );
	if ( ! $items ) {
		return array();
	}
	$by_id = array();
	foreach ( $items as $item ) {
		$by_id[ (int) $item->ID ] = $item;
	}
	$tree = array();
	$pos  = array(); // top-level id => index in $tree
	foreach ( $items as $item ) {
		$entry = array( 'label' => wp_strip_all_tags( $item->title ), 'url' => $item->url, 'children' => array() );
		$top   = $item;
		while ( (int) $top->menu_item_parent && isset( $by_id[ (int) $top->menu_item_parent ] ) ) {
			$top = $by_id[ (int) $top->menu_item_parent ]; // Deeper levels are listed under their top-level item.
		}
		if ( (int) $item->ID === (int) $top->ID ) {
			$pos[ (int) $item->ID ] = count( $tree );
			$tree[]                 = $entry;
		} elseif ( isset( $pos[ (int) $top->ID ] ) ) {
			$tree[ $pos[ (int) $top->ID ] ]['children'][] = $entry;
		}
	}
	return $tree;
}

function builderlab_nav_tree_blocks( $post_id ) {
	$post = get_post( $post_id );
	if ( ! $post || 'wp_navigation' !== $post->post_type || 'publish' !== $post->post_status ) {
		return array();
	}
	return builderlab_nav_from_blocks( parse_blocks( $post->post_content ), 0 );
}

function builderlab_nav_from_blocks( array $blocks, $depth ) {
	$out = array();
	foreach ( $blocks as $block ) {
		$name  = $block['blockName'] ?? '';
		$attrs = $block['attrs'] ?? array();
		if ( 'core/navigation-link' === $name || 'core/navigation-submenu' === $name ) {
			$entry = array(
				'label'    => wp_strip_all_tags( (string) ( $attrs['label'] ?? '' ) ),
				'url'      => (string) ( $attrs['url'] ?? '' ),
				'children' => array(),
			);
			if ( 'core/navigation-submenu' === $name && ! empty( $block['innerBlocks'] ) ) {
				$sub = builderlab_nav_from_blocks( $block['innerBlocks'], $depth + 1 );
				// One level of submenu: anything deeper is listed in the same submenu.
				foreach ( $sub as $s ) {
					$kids = $s['children'];
					$s['children'] = array();
					$entry['children'][] = $s;
					foreach ( $kids as $k ) {
						$entry['children'][] = $k;
					}
				}
			}
			$out[] = $entry;
		} elseif ( 'core/home-link' === $name ) {
			$out[] = array( 'label' => (string) ( $attrs['label'] ?? 'Home' ), 'url' => home_url( '/' ), 'children' => array() );
		} elseif ( 'core/page-list' === $name ) {
			foreach ( get_pages( array( 'parent' => 0, 'sort_column' => 'menu_order,post_title' ) ) as $page ) {
				$out[] = array( 'label' => get_the_title( $page ), 'url' => get_permalink( $page ), 'children' => array() );
			}
		} elseif ( ! empty( $block['innerBlocks'] ) ) {
			$out = array_merge( $out, builderlab_nav_from_blocks( $block['innerBlocks'], $depth ) );
		}
	}
	return $out;
}

add_action( 'rest_api_init', function () {
	register_rest_route( 'builderlab/v1', '/editor/(?P<id>\d+)/menus', array(
		'methods'             => 'GET',
		'permission_callback' => 'builderlab_rest_can_edit',
		'callback'            => 'builderlab_nav_menus',
	) );
} );
