<?php
/**
 * BuilderLab visual editor: full-screen page, REST routes (load, render, save) and the canvas document.
 * Content is stored as standard block markup in post_content.
 */
defined( 'ABSPATH' ) || exit;

/* ---------- Tree <-> blocks ---------- */

function builderlab_node_id() {
	return 'n' . substr( md5( wp_generate_uuid4() ), 0, 10 );
}

/** Blocks that hold other blocks. */
function builderlab_container_blocks() {
	return array( 'builderlab/container' );
}

/** Converts parsed blocks to the editor tree. Blocks that are not BuilderLab blocks are kept whole as "opaque" nodes. */
function builderlab_blocks_to_tree( array $blocks ) {
	$tree = array();
	foreach ( $blocks as $b ) {
		$name = $b['blockName'];
		if ( null === $name ) {
			if ( '' === trim( (string) $b['innerHTML'] ) ) {
				continue;
			}
			$tree[] = array( 'id' => builderlab_node_id(), 'name' => 'builderlab/html', 'attrs' => array( 'html' => trim( $b['innerHTML'] ) ), 'children' => array(), 'converted' => true );
			continue;
		}
		if ( 0 === strpos( $name, 'builderlab/' ) ) {
			$tree[] = array(
				'id'       => builderlab_node_id(),
				'name'     => $name,
				'attrs'    => is_array( $b['attrs'] ) ? $b['attrs'] : array(),
				'children' => in_array( $name, builderlab_container_blocks(), true ) ? builderlab_blocks_to_tree( $b['innerBlocks'] ) : array(),
			);
		} else {
			$type   = WP_Block_Type_Registry::get_instance()->get_registered( $name );
			$tree[] = array( 'id' => builderlab_node_id(), 'name' => $name, 'attrs' => array(), 'children' => array(), 'opaque' => serialize_block( $b ), 'title' => $type ? $type->title : $name );
		}
	}
	return $tree;
}

/** Keeps only attributes the block declares, with the declared type. */
function builderlab_clean_attrs( $name, $attrs ) {
	$type = WP_Block_Type_Registry::get_instance()->get_registered( $name );
	if ( ! $type || ! is_array( $attrs ) ) {
		return array();
	}
	$out = array();
	foreach ( $type->attributes as $key => $def ) {
		if ( ! array_key_exists( $key, $attrs ) ) {
			continue;
		}
		$v = $attrs[ $key ];
		switch ( $def['type'] ?? 'string' ) {
			case 'boolean':
				$v = (bool) $v;
				break;
			case 'number':
				$v = is_numeric( $v ) ? $v + 0 : ( $def['default'] ?? 0 );
				break;
			case 'array':
				$v = is_array( $v ) ? array_values( $v ) : array();
				break;
			case 'object':
				$v = builderlab_clean_layout_attr( $key, $v );
				break;
			default:
				$v = is_scalar( $v ) ? (string) $v : '';
				if ( in_array( $key, array( 'gapCustom', 'rowGap', 'columnGap' ), true ) ) {
					$v = builderlab_ds_len( $v, '' );
				}
				if ( 'field' === $key ) {
					$v = builderlab_custom_field_name( $v );
				}
				if ( isset( $def['enum'] ) && ! in_array( $v, $def['enum'], true ) ) {
					$v = $def['default'] ?? $def['enum'][0];
				}
		}
		if ( array_key_exists( 'default', $def ) && $v === $def['default'] ) {
			continue; // Defaults are not written, as the block editor does.
		}
		$out[ $key ] = $v;
	}
	return $out;
}

/** Converts the editor tree to parsed blocks. With $with_ids the node id travels in the attributes (used for the canvas only). */
function builderlab_tree_to_blocks( array $nodes, $with_ids = false ) {
	$blocks = array();
	foreach ( $nodes as $n ) {
		if ( ! is_array( $n ) || empty( $n['name'] ) ) {
			continue;
		}
		$id = isset( $n['id'] ) ? sanitize_key( $n['id'] ) : '';
		if ( ! empty( $n['opaque'] ) ) {
			foreach ( parse_blocks( (string) $n['opaque'] ) as $parsed ) {
				if ( $with_ids && $id && null !== $parsed['blockName'] ) {
					$parsed['attrs']['_blid'] = $id;
				}
				$blocks[] = $parsed;
			}
			continue;
		}
		$name = (string) $n['name'];
		if ( 0 !== strpos( $name, 'builderlab/' ) || ! WP_Block_Type_Registry::get_instance()->is_registered( $name ) ) {
			continue;
		}
		$attrs = builderlab_clean_attrs( $name, $n['attrs'] ?? array() );
		if ( $with_ids && $id ) {
			$attrs['_blid'] = $id;
		}
		$inner = ( in_array( $name, builderlab_container_blocks(), true ) && ! empty( $n['children'] ) ) ? builderlab_tree_to_blocks( (array) $n['children'], $with_ids ) : array();
		$blocks[] = array(
			'blockName'    => $name,
			'attrs'        => $attrs,
			'innerBlocks'  => $inner,
			'innerHTML'    => '',
			'innerContent' => $inner ? array_fill( 0, count( $inner ), null ) : array(),
		);
	}
	return $blocks;
}

/** All BuilderLab blocks, with title, icon, defaults and attribute types. */
function builderlab_block_catalog() {
	$out = array();
	foreach ( builderlab_block_names() as $short ) {
		$type = WP_Block_Type_Registry::get_instance()->get_registered( 'builderlab/' . $short );
		if ( ! $type ) {
			continue;
		}
		$attrs = array();
		foreach ( $type->attributes as $key => $def ) {
			$attrs[ $key ] = array( 'type' => $def['type'] ?? 'string', 'default' => $def['default'] ?? null, 'enum' => $def['enum'] ?? null );
		}
		$out[] = array(
			'name'        => $type->name,
			'title'       => str_replace( 'BuilderLab ', '', $type->title ),
			'description' => $type->description,
			'icon'        => 'dashicons-' . ( is_string( $type->icon ) ? $type->icon : 'admin-generic' ),
			'attributes'  => $attrs,
			'container'   => in_array( $type->name, builderlab_container_blocks(), true ),
		);
	}
	return $out;
}

/* ---------- Canvas rendering ---------- */

/** In editor render mode every block gets data-bl-id, so a click on the canvas finds its node. */
add_filter( 'render_block', function ( $content, $parsed ) {
	if ( empty( $GLOBALS['builderlab_editor_render'] ) ) {
		return $content;
	}
	$id = isset( $parsed['attrs']['_blid'] ) ? sanitize_key( $parsed['attrs']['_blid'] ) : '';
	if ( '' === $id ) {
		return $content;
	}
	if ( '' === trim( $content ) ) {
		$title = $parsed['blockName'] ? str_replace( array( 'builderlab/', '-' ), array( '', ' ' ), $parsed['blockName'] ) : 'block';
		return '<div class="bl-empty-node" data-bl-id="' . esc_attr( $id ) . '">Empty ' . esc_html( $title ) . ' (nothing is shown on the page yet)</div>';
	}
	$p = new WP_HTML_Tag_Processor( $content );
	if ( $p->next_tag() ) {
		$p->set_attribute( 'data-bl-id', $id );
		return $p->get_updated_html();
	}
	return $content;
}, 20, 2 );

/* ---------- REST ---------- */

function builderlab_rest_can_edit( WP_REST_Request $req ) {
	$id = (int) $req->get_param( 'id' );
	return $id ? builderlab_can_edit_post( $id ) : current_user_can( 'edit_posts' );
}

function builderlab_editor_payload( WP_Post $post ) {
	$content = (string) $post->post_content;
	$tree    = builderlab_blocks_to_tree( parse_blocks( $content ) );
	$type    = get_post_type_object( $post->post_type );
	$is_template = BUILDERLAB_TEMPLATE_CPT === $post->post_type;
	$suggested   = 'auto-draft' === $post->post_status ? (string) get_post_meta( $post->ID, '_bl_suggested_title', true ) : '';
	$post_types  = array();
	foreach ( builderlab_candidate_post_types() as $name => $obj ) {
		$post_types[] = array( 'name' => $name, 'label' => $obj->labels->name );
	}
	$taxonomies = array();
	foreach ( get_taxonomies( array( 'public' => true ), 'objects' ) as $name => $obj ) {
		$taxonomies[] = array( 'name' => $name, 'label' => $obj->labels->name );
	}
	$roles = array();
	foreach ( wp_roles()->roles as $slug => $role ) {
		$roles[] = array( 'name' => $slug, 'label' => translate_user_role( $role['name'] ) );
	}
	$components = array();
	foreach ( get_posts( array( 'post_type' => BUILDERLAB_TEMPLATE_CPT, 'post_status' => array( 'publish', 'draft' ), 'posts_per_page' => 100, 'orderby' => 'title', 'order' => 'ASC', 'no_found_rows' => true ) ) as $t ) {
		if ( 'component' === builderlab_template_type( $t->ID ) && $t->ID !== $post->ID ) {
			$components[] = array( 'id' => $t->ID, 'title' => get_the_title( $t ) ?: '(no title)' );
		}
	}
	return array(
		'template' => $is_template ? array(
			'type'       => builderlab_template_type( $post->ID ),
			'types'      => builderlab_template_types(),
			'conditions' => builderlab_template_conditions( $post->ID ),
			'priority'   => builderlab_template_priority( $post->ID ),
			'options'    => array( 'postTypes' => $post_types, 'taxonomies' => $taxonomies, 'roles' => $roles ),
			'summary'    => '',
		) : null,
		'components' => $components,
		'layout'   => $is_template ? '' : builderlab_post_layout( $post->ID ),
		'layouts'  => builderlab_layout_modes(),
		'previewUrl' => $is_template ? '' : add_query_arg( array( 'p' => $post->ID, 'post_type' => $post->post_type, 'bl_edit' => '1' ), home_url( '/' ) ),
		'post'    => array(
			'id'       => $post->ID,
			'title'    => 'auto-draft' === $post->post_status ? $suggested : get_the_title( $post ),
			'status'   => $post->post_status,
			'type'     => $post->post_type,
			'typeName' => $type ? $type->labels->singular_name : $post->post_type,
			'typePlural' => $type ? $type->labels->name : $post->post_type,
			'link'     => 'publish' === $post->post_status ? get_permalink( $post ) : add_query_arg( array( 'p' => $post->ID, 'post_type' => $post->post_type, 'preview' => 'true' ), home_url( '/' ) ),
			'editUrl'  => get_edit_post_link( $post->ID, 'raw' ),
			'modified' => $post->post_modified_gmt,
			'canPublish' => current_user_can( 'publish_post', $post->ID ),
			'listUrl'  => admin_url( 'edit.php' . ( 'post' === $post->post_type ? '' : '?post_type=' . $post->post_type ) ),
		),
		'tree'    => $tree,
		'blocks'  => builderlab_block_catalog(),
		'roles'   => builderlab_ds_resolve_roles( builderlab_ds_get() ),
		'tokens'  => builderlab_ds_editor_palette(),
		'imported' => (bool) array_filter( $tree, function ( $n ) {
			return ! empty( $n['converted'] );
		} ),
	);
}

add_action( 'rest_api_init', function () {
	register_rest_route( 'builderlab/v1', '/editor/(?P<id>\d+)', array(
		array(
			'methods'             => 'GET',
			'permission_callback' => 'builderlab_rest_can_edit',
			'callback'            => function ( WP_REST_Request $req ) {
				return builderlab_editor_payload( get_post( (int) $req['id'] ) );
			},
		),
		array(
			'methods'             => 'POST',
			'permission_callback' => 'builderlab_rest_can_edit',
			'callback'            => function ( WP_REST_Request $req ) {
				$post = get_post( (int) $req['id'] );
				$tree = $req->get_param( 'tree' );
				if ( ! is_array( $tree ) ) {
					return new WP_Error( 'builderlab_bad_tree', 'No content was sent.', array( 'status' => 400 ) );
				}
				$loaded = (string) $req->get_param( 'loaded' );
				if ( '' !== $loaded && $loaded !== $post->post_modified_gmt && ! $req->get_param( 'force' ) ) {
					return new WP_Error( 'builderlab_conflict', 'This page was changed somewhere else after you opened it. Reload to see the newer version, or save again to replace it.', array( 'status' => 409 ) );
				}
				$content = serialize_blocks( builderlab_tree_to_blocks( $tree ) );
				$data    = array( 'ID' => $post->ID, 'post_content' => wp_slash( $content ) );
				$title   = $req->get_param( 'title' );
				if ( is_string( $title ) ) {
					$data['post_title'] = wp_slash( sanitize_text_field( $title ) );
				}
				$status = (string) $req->get_param( 'status' );
				if ( in_array( $status, array( 'draft', 'publish' ), true ) && $status !== $post->post_status && current_user_can( 'publish_post', $post->ID ) ) {
					$data['post_status'] = $status;
				}
				$result = wp_update_post( $data, true );
				if ( is_wp_error( $result ) ) {
					return $result;
				}
				$layout = (string) $req->get_param( 'layout' );
				if ( BUILDERLAB_TEMPLATE_CPT !== $post->post_type && isset( builderlab_layout_modes()[ $layout ] ) ) {
					update_post_meta( $post->ID, BUILDERLAB_LAYOUT_META, $layout );
				}
				$template = $req->get_param( 'template' );
				if ( BUILDERLAB_TEMPLATE_CPT === $post->post_type && is_array( $template ) ) {
					builderlab_save_template_settings( $post->ID, $template );
				}
				update_post_meta( $post->ID, BUILDERLAB_MODE_META, 1 );
				$fresh = get_post( $post->ID );
				return array(
					'ok'       => true,
					'status'   => $fresh->post_status,
					'modified' => $fresh->post_modified_gmt,
					'title'    => get_the_title( $fresh ),
					'link'     => 'publish' === $fresh->post_status ? get_permalink( $fresh ) : get_preview_post_link( $fresh ),
					'bytes'    => strlen( $content ),
				);
			},
		),
	) );

	register_rest_route( 'builderlab/v1', '/editor/(?P<id>\d+)/fields', array(
		'methods'             => 'GET',
		'permission_callback' => 'builderlab_rest_can_edit',
		'callback'            => function ( WP_REST_Request $req ) {
			global $wpdb;
			$post = get_post( (int) $req['id'] );
			$out  = array( 'acfActive' => function_exists( 'acf_get_field_groups' ), 'acf' => array(), 'meta' => array() );
			if ( $out['acfActive'] ) {
				foreach ( (array) acf_get_field_groups() as $group ) {
					foreach ( (array) acf_get_fields( $group ) as $field ) {
						if ( 'image' === ( $field['type'] ?? '' ) ) {
							$out['acf'][] = array( 'name' => $field['name'], 'label' => $field['label'], 'group' => $group['title'] );
						}
					}
				}
			}
			$keys = $wpdb->get_col( $wpdb->prepare(
				"SELECT DISTINCT pm.meta_key FROM {$wpdb->postmeta} pm INNER JOIN {$wpdb->posts} p ON p.ID = pm.post_id WHERE p.post_type = %s AND pm.meta_key NOT LIKE %s ORDER BY pm.meta_key LIMIT 150",
				$post->post_type,
				$wpdb->esc_like( '_' ) . '%'
			) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
			$out['meta'] = array_values( array_filter( (array) $keys, 'builderlab_custom_field_name' ) );
			return $out;
		},
	) );

	register_rest_route( 'builderlab/v1', '/editor/render', array(
		'methods'             => 'POST',
		'permission_callback' => function ( WP_REST_Request $req ) {
			$post_id = (int) $req->get_param( 'post' );
			return $post_id ? builderlab_can_edit_post( $post_id ) : false;
		},
		'callback'            => function ( WP_REST_Request $req ) {
			$tree = $req->get_param( 'tree' );
			if ( ! is_array( $tree ) ) {
				return new WP_Error( 'builderlab_bad_tree', 'No content was sent.', array( 'status' => 400 ) );
			}
			global $post;
			$post = get_post( (int) $req->get_param( 'post' ) ); // phpcs:ignore WordPress.WP.GlobalVariablesOverride
			setup_postdata( $post );
			$GLOBALS['builderlab_editor_render'] = true;
			$html                                = do_blocks( serialize_blocks( builderlab_tree_to_blocks( $tree, true ) ) );
			$GLOBALS['builderlab_editor_render'] = false;
			wp_reset_postdata();
			return array( 'html' => $html . builderlab_custom_css_flush() );
		},
	) );
} );

/* ---------- Full-screen editor page ---------- */

add_action( 'admin_menu', function () {
	// Hidden page: reachable by URL, not shown in the menu.
	$hook = add_submenu_page( 'options.php', 'BuilderLab editor', 'BuilderLab editor', 'edit_posts', 'builderlab-editor', '__return_null' );
	add_action( 'load-' . $hook, 'builderlab_render_editor_screen' );
} );

function builderlab_render_editor_screen() {
	$post_id = (int) ( $_GET['post'] ?? 0 ); // phpcs:ignore WordPress.Security.NonceVerification
	if ( ! $post_id || ! builderlab_can_edit_post( $post_id ) ) {
		wp_die(
			'This item cannot be edited with BuilderLab. Check that its content type is switched on in <a href="' . esc_url( admin_url( 'admin.php?page=builderlab-settings' ) ) . '">BuilderLab settings</a>, and that you may edit it.',
			'BuilderLab',
			array( 'response' => 403 )
		);
	}
	wp_enqueue_media( array( 'post' => $post_id ) );
	wp_register_style( 'builderlab-app', BUILDERLAB_URL . 'assets/editor-app/app.css', array( 'dashicons', 'media-views' ), BUILDERLAB_VERSION );
	wp_register_script( 'builderlab-app', BUILDERLAB_URL . 'assets/editor-app/app.js', array( 'wp-element', 'wp-api-fetch', 'media-editor' ), BUILDERLAB_VERSION, true );
	wp_localize_script( 'builderlab-app', 'builderlabApp', array(
		'postId'    => $post_id,
		'canvasUrl' => wp_nonce_url( admin_url( 'admin-post.php?action=builderlab_canvas' ), 'builderlab_canvas' ),
		'settings'  => admin_url( 'admin.php?page=builderlab-settings' ),
		'design'    => admin_url( 'admin.php?page=builderlab-design-system' ),
	) );
	nocache_headers();
	header( 'Content-Type: text/html; charset=utf-8' );
	echo '<!doctype html><html lang="' . esc_attr( get_bloginfo( 'language' ) ) . '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">';
	echo '<title>Edit with BuilderLab</title>';
	wp_print_styles( 'builderlab-app' );
	echo '</head><body class="builderlab-app-body"><div id="builderlab-app"><p class="bl-app-loading">Loading the editor…</p></div>';
	echo '<noscript><p>The BuilderLab editor needs JavaScript.</p></noscript>';
	wp_print_scripts( 'builderlab-app' );
	wp_print_media_templates();
	echo '</body></html>';
	exit;
}

/** The blank page shown in the editor frame: design tokens and block styles, no theme. */
add_action( 'admin_post_builderlab_canvas', function () {
	if ( ! current_user_can( 'edit_posts' ) || ! isset( $_GET['_wpnonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_GET['_wpnonce'] ) ), 'builderlab_canvas' ) ) {
		wp_die( 'You are not allowed to see this page.', 'Not allowed', array( 'response' => 403 ) );
	}
	$build  = get_option( BUILDERLAB_DS_BUILD );
	$tokens = ( is_array( $build ) && ! empty( $build['url'] ) ) ? '<link rel="stylesheet" href="' . esc_url( $build['url'] ) . '">' : '<style>' . builderlab_ds_compile( builderlab_ds_get() ) . '</style>'; // phpcs:ignore WordPress.Security.EscapeOutput
	nocache_headers();
	header( 'Content-Type: text/html; charset=utf-8' );
	echo '<!doctype html><html lang="' . esc_attr( get_bloginfo( 'language' ) ) . '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Canvas</title>';
	echo $tokens; // phpcs:ignore WordPress.Security.EscapeOutput
	echo '<link rel="stylesheet" href="' . esc_url( BUILDERLAB_URL . 'assets/frontend.css?ver=' . BUILDERLAB_VERSION ) . '">';
	echo '<style>html{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}body{margin:0;background:var(--bl-color-bg);color:var(--bl-color-text);font-size:var(--bl-size-body);line-height:1.5}#bl-canvas{min-height:100vh;padding:16px;box-sizing:border-box;display:flex;flex-direction:column;gap:var(--bl-space-4)}';
	echo '[data-bl-id]{cursor:pointer}[data-bl-id]:hover{outline:2px dashed #000;outline-offset:2px}.bl-sel{outline:2px solid #000!important;outline-offset:2px;box-shadow:0 0 0 5px #fff!important}.bl-flag-error{box-shadow:0 0 0 3px #000,0 0 0 5px #fff}.bl-flag-warning{outline:2px dashed #000;outline-offset:3px}.bl-empty-node{padding:16px;border:2px dashed #555;color:#444;background:#f3f3f3}.bl-opaque-note{font-size:12px;color:#444}</style>';
	echo '<style>.bl-drop-before{box-shadow:0 -4px 0 0 #000!important}.bl-drop-after{box-shadow:0 4px 0 0 #000!important}.bl-drop-inside{outline:3px dashed #000!important;outline-offset:-3px;background:rgba(0,0,0,.06)}</style>';
	echo '</head><body class="bl-editing"><main id="bl-canvas"></main></body></html>';
	exit;
} );
