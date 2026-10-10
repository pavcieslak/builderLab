<?php
/**
 * Page layout: how a page built with BuilderLab sits in the theme.
 * - theme:  the theme's own template, header, footer and content width
 * - full:   theme header and footer, but the content is not narrowed to the theme's column
 * - canvas: only the page content, no header and no footer
 * The editor preview loads the real page with the same mode, so editing looks like the live page.
 */
defined( 'ABSPATH' ) || exit;

const BUILDERLAB_LAYOUT_META = '_builderlab_layout';

function builderlab_layout_modes() {
	return array(
		'theme'  => 'Theme default: theme header, footer and content width',
		'full'   => 'Full width: theme header and footer, content not narrowed',
		'canvas' => 'Canvas: only your content, no header and no footer',
	);
}

function builderlab_post_layout( $post_id ) {
	$mode = (string) get_post_meta( $post_id, BUILDERLAB_LAYOUT_META, true );
	return isset( builderlab_layout_modes()[ $mode ] ) ? $mode : 'theme';
}

/** True on a page loaded inside the editor preview by someone who may edit it. */
function builderlab_is_edit_preview() {
	return isset( $_GET['bl_edit'] ) && is_singular() && current_user_can( 'edit_post', get_queried_object_id() ); // phpcs:ignore WordPress.Security.NonceVerification
}

/** The layout for this request. The editor can preview a choice that is not saved yet. */
function builderlab_request_layout() {
	if ( ! is_singular() ) {
		return 'theme';
	}
	$id   = get_queried_object_id();
	$mode = builderlab_post_layout( $id );
	if ( isset( $_GET['bl_layout'] ) && builderlab_is_edit_preview() ) { // phpcs:ignore WordPress.Security.NonceVerification
		$wanted = sanitize_key( wp_unslash( $_GET['bl_layout'] ) ); // phpcs:ignore WordPress.Security.NonceVerification
		$mode   = isset( builderlab_layout_modes()[ $wanted ] ) ? $wanted : $mode;
	}
	return $mode;
}

/** Canvas: the plugin's own bare template. */
add_filter( 'template_include', function ( $template ) {
	if ( is_singular() && 'canvas' === builderlab_request_layout() ) {
		return BUILDERLAB_DIR . 'templates/canvas.php';
	}
	return $template;
}, 99 );

add_filter( 'body_class', function ( $classes ) {
	if ( is_singular() ) {
		$classes[] = 'bl-layout-' . builderlab_request_layout();
		if ( builderlab_is_edit_preview() ) {
			$classes[] = 'bl-editing';
		}
	}
	return $classes;
} );

/** Full width: the theme's content column no longer narrows the page's elements. */
add_action( 'wp_head', function () {
	if ( is_singular() && 'full' === builderlab_request_layout() ) {
		echo '<style id="bl-layout-full">.bl-layout-full .wp-block-post-content,.bl-layout-full .entry-content{max-width:none!important}'
			. '.bl-layout-full .wp-block-post-content>*,.bl-layout-full .entry-content>*{max-width:none!important;margin-left:0!important;margin-right:0!important}'
			. '.bl-layout-full .wp-block-post-title,.bl-layout-full .wp-block-post-featured-image{max-width:none}</style>' . "\n";
	}
}, 100 );

/** In the editor preview the content area is marked, so the editor can replace its content. */
add_filter( 'render_block_core/post-content', function ( $content ) {
	if ( ! builderlab_is_edit_preview() ) {
		return $content;
	}
	$p = new WP_HTML_Tag_Processor( $content );
	if ( $p->next_tag() ) {
		$p->set_attribute( 'data-bl-root', '1' );
		return $p->get_updated_html();
	}
	return $content;
}, 20 );

/** Classic themes: a neutral wrapper in the preview. */
add_filter( 'the_content', function ( $content ) {
	if ( ! wp_is_block_theme() && builderlab_is_edit_preview() && in_the_loop() && is_main_query() ) {
		return '<div data-bl-root="1" style="display:contents">' . $content . '</div>';
	}
	return $content;
}, 9999 );

/** The page's own styles must be available in the preview even when the page is still empty. */
add_action( 'wp_enqueue_scripts', function () {
	if ( builderlab_is_edit_preview() ) {
		wp_enqueue_style( 'builderlab-frontend' );
	}
} );

add_action( 'send_headers', function () {
	if ( isset( $_GET['bl_edit'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification
		nocache_headers();
	}
} );
