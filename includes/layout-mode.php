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

/** True when a page holds only BuilderLab elements, so the theme's and WordPress's block styles are not needed. */
function builderlab_page_is_pure( $post_id ) {
	$check = function ( array $blocks ) use ( &$check ) {
		foreach ( $blocks as $b ) {
			$name = $b['blockName'];
			if ( null === $name ) {
				if ( '' !== trim( (string) $b['innerHTML'] ) ) {
					return false;
				}
				continue;
			}
			if ( 0 !== strpos( $name, 'builderlab/' ) || ( ! empty( $b['innerBlocks'] ) && ! $check( $b['innerBlocks'] ) ) ) {
				return false;
			}
		}
		return true;
	};
	return $check( parse_blocks( (string) get_post_field( 'post_content', $post_id ) ) );
}

/**
 * Lean canvas: a Canvas page sends only what it needs.
 * Always: no feed, oEmbed, RSD, REST, shortlink or generator links, no emoji script or styles.
 * When the page has only BuilderLab elements: also no theme presets, block library or theme stylesheet.
 */
function builderlab_canvas_lean( $pure ) {
	foreach ( array(
		array( 'wp_head', 'feed_links', 2 ), array( 'wp_head', 'feed_links_extra', 3 ), array( 'wp_head', 'rsd_link', 10 ), array( 'wp_head', 'wlwmanifest_link', 10 ),
		array( 'wp_head', 'wp_shortlink_wp_head', 10 ), array( 'wp_head', 'rest_output_link_wp_head', 10 ), array( 'wp_head', 'wp_oembed_add_discovery_links', 10 ),
		array( 'wp_head', 'wp_generator', 10 ), array( 'wp_head', 'print_emoji_detection_script', 7 ), array( 'wp_print_styles', 'print_emoji_styles', 10 ),
		array( 'wp_enqueue_scripts', 'wp_enqueue_emoji_styles', 10 ), array( 'wp_print_footer_scripts', '_print_emoji_detection_script', 10 ),
		array( 'wp_head', 'wp_print_auto_sizes_contain_css_fix', 1 ),
	) as $r ) {
		remove_action( $r[0], $r[1], $r[2] );
	}
	add_filter( 'emoji_svg_url', '__return_false' );
	if ( ! $pure ) {
		return;
	}
	remove_action( 'wp_enqueue_scripts', 'wp_enqueue_global_styles' );
	remove_action( 'wp_footer', 'wp_enqueue_global_styles', 1 );
	remove_action( 'wp_footer', 'the_block_template_skip_link' );
	remove_action( 'wp_enqueue_scripts', 'wp_enqueue_classic_theme_styles' );
	remove_action( 'wp_head', 'wp_print_font_faces', 50 );
	remove_action( 'wp_head', 'wp_print_font_faces_from_style_variations', 50 );
	$drop = function () {
		foreach ( array( 'global-styles', 'wp-block-library', 'wp-block-library-theme', 'classic-theme-styles', 'wp-block-template-skip-link', get_stylesheet() . '-style', get_template() . '-style' ) as $h ) {
			wp_dequeue_style( $h );
		}
	};
	add_action( 'wp_enqueue_scripts', $drop, 100 );
	add_action( 'wp_print_styles', $drop, 100 );
	// Without the theme's presets the page needs a base: the design system's text and background.
	// With "inherit" the font is the theme's own body font (and only its font files), so the layouts look alike.
	add_action( 'wp_head', function () {
		$font = builderlab_ds_get()['typography']['font-body'];
		if ( 'inherit' === $font ) {
			$font = builderlab_theme_body_font();
		}
		echo '<style id="bl-canvas-base">body.bl-canvas{margin:0;background:var(--bl-color-bg);color:var(--bl-color-text);font-family:' . esc_html( $font ) . ';font-size:var(--bl-size-body);line-height:var(--bl-line-height-body)}</style>' . "\n"; // phpcs:ignore WordPress.Security.EscapeOutput
	}, 20 );
}

/**
 * The font stack the active theme sets on the body, and prints the font files of that one family.
 * Falls back to the system font stack.
 */
function builderlab_theme_body_font() {
	$system = 'system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';
	if ( ! function_exists( 'wp_get_global_styles' ) ) {
		return $system;
	}
	$value = wp_get_global_styles( array( 'typography', 'fontFamily' ) );
	if ( ! is_string( $value ) || '' === $value ) {
		return $system;
	}
	$slug = '';
	if ( preg_match( '/^var:preset\|font-family\|([a-z0-9-]+)$/', $value, $m ) || preg_match( '/^var\(--wp--preset--font-family--([a-z0-9-]+)\)$/', $value, $m ) ) {
		$slug = $m[1];
	}
	if ( '' === $slug ) {
		return $value;
	}
	$families = wp_get_global_settings( array( 'typography', 'fontFamilies' ) );
	foreach ( array( 'custom', 'theme', 'default' ) as $origin ) {
		foreach ( (array) ( $families[ $origin ] ?? array() ) as $family ) {
			if ( ( $family['slug'] ?? '' ) !== $slug || empty( $family['fontFamily'] ) ) {
				continue;
			}
			$stack = (string) $family['fontFamily'];
			if ( class_exists( 'WP_Font_Face_Resolver' ) && function_exists( 'wp_print_font_faces' ) ) {
				$name = trim( explode( ',', $stack )[0], " \"'" );
				$faces = array();
				foreach ( WP_Font_Face_Resolver::get_fonts_from_theme_json() as $key => $face_list ) {
					if ( is_array( $face_list ) && $face_list && trim( (string) ( $face_list[0]['font-family'] ?? '' ), " \"'" ) === $name ) {
						$faces[ $key ] = $face_list;
					}
				}
				if ( $faces ) {
					wp_print_font_faces( $faces ); // Runs inside wp_head, so this prints in place.
				}
			}
			return $stack;
		}
	}
	return $system;
}

/** Canvas: the plugin's own bare template. */
add_filter( 'template_include', function ( $template ) {
	if ( is_singular() && 'canvas' === builderlab_request_layout() ) {
		builderlab_canvas_lean( builderlab_page_is_pure( get_queried_object_id() ) );
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
	if ( '' === trim( (string) $content ) ) {
		// Core prints nothing for an empty page. The editor still needs a place to show new elements.
		return '<div class="entry-content wp-block-post-content" data-bl-root="1"></div>';
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

/**
 * The editor preview must load the page being edited whatever its status, including a brand new page
 * (an "auto draft"), which WordPress would otherwise answer with a 404. Only for people who may edit it.
 */
add_action( 'pre_get_posts', function ( $query ) {
	if ( is_admin() || ! $query->is_main_query() || ! isset( $_GET['bl_edit'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification
		return;
	}
	$id = (int) ( $query->get( 'p' ) ?: $query->get( 'page_id' ) );
	if ( $id && current_user_can( 'edit_post', $id ) ) {
		// The URL query var post_type is not honoured for the main query, so the type comes from the stored post.
		$query->set( 'post_type', get_post_type( $id ) );
		$query->set( 'post_status', array( 'publish', 'draft', 'pending', 'private', 'future', 'auto-draft' ) );
	}
} );

/** The editor preview is a clean page: no WordPress admin bar and no gap where it would sit. */
add_filter( 'show_admin_bar', function ( $show ) {
	return isset( $_GET['bl_edit'] ) ? false : $show; // phpcs:ignore WordPress.Security.NonceVerification
}, 99 );

add_action( 'send_headers', function () {
	if ( isset( $_GET['bl_edit'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification
		nocache_headers();
	}
} );
