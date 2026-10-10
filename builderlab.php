<?php
/**
 * Plugin Name: BuilderLab
 * Description: Lean, accessibility-first building blocks with a built-in WCAG 2.2 AA checker. Spike version.
 * Version: 0.13.0
 * Requires at least: 6.5
 * Requires PHP: 7.4
 * License: GPL-2.0-or-later
 * Text Domain: builderlab
 */

defined( 'ABSPATH' ) || exit;

define( 'BUILDERLAB_VERSION', '0.14.0' );
define( 'BUILDERLAB_DIR', plugin_dir_path( __FILE__ ) );
define( 'BUILDERLAB_URL', plugin_dir_url( __FILE__ ) );

require_once BUILDERLAB_DIR . 'includes/helpers.php';
require_once BUILDERLAB_DIR . 'includes/design-system.php';
require_once BUILDERLAB_DIR . 'includes/cli.php';
require_once BUILDERLAB_DIR . 'includes/form.php';
require_once BUILDERLAB_DIR . 'includes/admin.php';
require_once BUILDERLAB_DIR . 'includes/layout.php';
require_once BUILDERLAB_DIR . 'includes/templates.php';
require_once BUILDERLAB_DIR . 'includes/layout-mode.php';
require_once BUILDERLAB_DIR . 'includes/settings.php';
require_once BUILDERLAB_DIR . 'includes/editor.php';
require_once BUILDERLAB_DIR . 'includes/loop.php';
require_once BUILDERLAB_DIR . 'includes/custom-css.php';
require_once BUILDERLAB_DIR . 'includes/nav-source.php';

/** Every block, in the order shown in the inserter. */
function builderlab_block_names() {
	return array(
		'container', 'heading', 'text', 'button', 'image',
		'list', 'divider', 'quote', 'table', 'alert', 'html',
		'accordion', 'tabs', 'nav', 'breadcrumbs', 'search', 'form', 'loop', 'template',
	);
}

add_action( 'init', function () {
	// Shared handles must exist before the blocks that reference them are registered.
	builderlab_ds_register_style(); // Design tokens: one small generated file.
	wp_register_style( 'builderlab-frontend', BUILDERLAB_URL . 'assets/frontend.css', array( 'builderlab-tokens' ), BUILDERLAB_VERSION );
	wp_register_style( 'builderlab-editor', BUILDERLAB_URL . 'assets/editor.css', array(), BUILDERLAB_VERSION );
	wp_register_script( 'builderlab-tabs', BUILDERLAB_URL . 'assets/tabs.js', array(), BUILDERLAB_VERSION, array( 'strategy' => 'defer', 'in_footer' => true ) );
	wp_register_script( 'builderlab-loop', BUILDERLAB_URL . 'assets/loop.js', array(), BUILDERLAB_VERSION, array( 'strategy' => 'defer', 'in_footer' => true ) );
	wp_register_script( 'builderlab-nav', BUILDERLAB_URL . 'assets/nav.js', array(), BUILDERLAB_VERSION, array( 'strategy' => 'defer', 'in_footer' => true ) );

	// Editor: shared helpers, then block screens, then the checker.
	$base = array( 'wp-blocks', 'wp-element', 'wp-block-editor', 'wp-components', 'wp-i18n', 'wp-data', 'wp-compose', 'wp-hooks' );
	wp_register_script( 'builderlab-shared', BUILDERLAB_URL . 'assets/editor/shared.js', array_merge( $base, array( 'wp-server-side-render', 'wp-editor' ) ), BUILDERLAB_VERSION, true );
	wp_register_script( 'builderlab-blocks', BUILDERLAB_URL . 'assets/editor/blocks.js', array( 'builderlab-shared' ), BUILDERLAB_VERSION, true );
	wp_register_script(
		'builderlab-editor',
		BUILDERLAB_URL . 'assets/editor.js',
		array_merge( $base, array( 'wp-plugins', 'wp-editor', 'wp-edit-post', 'wp-preferences', 'builderlab-shared', 'builderlab-blocks' ) ),
		BUILDERLAB_VERSION,
		true
	);
	wp_localize_script(
		'builderlab-editor',
		'builderlabConfig',
		array(
			'axeUrl' => BUILDERLAB_URL . 'assets/vendor/axe.min.js?ver=4.14.0',
			'tokens' => builderlab_ds_editor_palette(),
			'roles'  => builderlab_ds_resolve_roles( builderlab_ds_get() ),
		)
	);

	foreach ( builderlab_block_names() as $block ) {
		register_block_type( BUILDERLAB_DIR . 'blocks/' . $block );
	}
} );

// Editor-only assets (also applies to the iframed canvas).
add_action( 'enqueue_block_assets', function () {
	if ( is_admin() ) {
		wp_enqueue_style( 'builderlab-frontend' );
		wp_enqueue_style( 'builderlab-editor' );
	}
} );

add_action( 'enqueue_block_editor_assets', function () {
	wp_enqueue_script( 'builderlab-editor' );
} );

add_filter( 'block_categories_all', function ( $categories ) {
	array_unshift( $categories, array( 'slug' => 'builderlab', 'title' => 'BuilderLab' ) );
	return $categories;
} );
