<?php
/**
 * BuilderLab admin: the design system screen, its REST routes and the live style guide.
 */
defined( 'ABSPATH' ) || exit;

const BUILDERLAB_ADMIN_SLUG = 'builderlab-design-system';

add_action( 'admin_menu', function () {
	add_menu_page( 'BuilderLab design system', 'BuilderLab', 'manage_options', BUILDERLAB_ADMIN_SLUG, 'builderlab_render_admin_page', 'dashicons-art', 58 );
	add_submenu_page( BUILDERLAB_ADMIN_SLUG, 'Design system', 'Design system', 'manage_options', BUILDERLAB_ADMIN_SLUG, 'builderlab_render_admin_page' );
} );

function builderlab_render_admin_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	echo '<div class="wrap builderlab-ds-wrap"><h1 class="screen-reader-text">BuilderLab design system</h1>';
	echo '<div id="builderlab-ds-root"><p>Loading the design system…</p></div>';
	echo '<noscript><p>This screen needs JavaScript. The design system can also be managed with WP-CLI: <code>wp builderlab ds</code>.</p></noscript></div>';
}

add_action( 'admin_enqueue_scripts', function ( $hook ) {
	if ( 'toplevel_page_' . BUILDERLAB_ADMIN_SLUG !== $hook ) {
		return;
	}
	wp_enqueue_style( 'builderlab-admin', BUILDERLAB_URL . 'assets/admin/design-system.css', array(), BUILDERLAB_VERSION );
	wp_enqueue_script( 'builderlab-admin', BUILDERLAB_URL . 'assets/admin/design-system.js', array( 'wp-element', 'wp-api-fetch' ), BUILDERLAB_VERSION, true );
	wp_localize_script( 'builderlab-admin', 'builderlabDS', array(
		'guideUrl' => wp_nonce_url( admin_url( 'admin-post.php?action=builderlab_style_guide' ), 'builderlab_style_guide' ),
	) );
} );

/* ---------- REST ---------- */

function builderlab_rest_can() {
	return current_user_can( 'manage_options' );
}

function builderlab_role_help() {
	return array(
		'text'         => array( 'Text', 'Body text and headings.' ),
		'text-muted'   => array( 'Muted text', 'Captions, hints and secondary text.' ),
		'bg'           => array( 'Page background', 'The main page background.' ),
		'surface'      => array( 'Surface', 'Panels, table headers and light areas.' ),
		'border'       => array( 'Border', 'Dividers, table and accordion borders.' ),
		'input-border' => array( 'Field border', 'Borders of form fields.' ),
		'primary'      => array( 'Primary', 'Main buttons, current states and accents.' ),
		'on-primary'   => array( 'Text on primary', 'Text placed on the primary color.' ),
		'secondary'    => array( 'Secondary', 'Secondary actions.' ),
		'on-secondary' => array( 'Text on secondary', 'Text placed on the secondary color.' ),
		'accent'       => array( 'Accent', 'Highlights.' ),
		'on-accent'    => array( 'Text on accent', 'Text placed on the accent color.' ),
		'link'         => array( 'Link', 'Text links.' ),
		'focus'        => array( 'Focus ring', 'Keyboard focus outline.' ),
		'info'         => array( 'Information', 'Information alert border.' ),
		'info-bg'      => array( 'Information background', 'Information alert background.' ),
		'success'      => array( 'Success', 'Success alert border and messages.' ),
		'success-bg'   => array( 'Success background', 'Success alert background.' ),
		'warning'      => array( 'Warning', 'Warning alert border.' ),
		'warning-bg'   => array( 'Warning background', 'Warning alert background.' ),
		'danger'       => array( 'Error', 'Error messages and error borders.' ),
		'danger-bg'    => array( 'Error background', 'Error alert and error summary background.' ),
	);
}

function builderlab_rest_payload( array $extra = array() ) {
	$ds = builderlab_ds_get();
	return array_merge( array(
		'system'   => $ds,
		'defaults' => builderlab_ds_defaults(),
		'pairs'    => builderlab_ds_pairs(),
		'contrast' => builderlab_ds_contrast( $ds ),
		'roleHelp' => builderlab_role_help(),
		'schema'   => builderlab_ds_component_schema(),
	), $extra );
}

add_action( 'rest_api_init', function () {
	register_rest_route( 'builderlab/v1', '/design-system', array(
		array(
			'methods'             => 'GET',
			'permission_callback' => 'builderlab_rest_can',
			'callback'            => function () {
				return builderlab_rest_payload( array( 'revisions' => builderlab_rest_revisions() ) );
			},
		),
		array(
			'methods'             => 'POST',
			'permission_callback' => 'builderlab_rest_can',
			'callback'            => function ( WP_REST_Request $req ) {
				$data = $req->get_param( 'system' );
				if ( ! is_array( $data ) ) {
					return new WP_Error( 'builderlab_bad_request', 'No design system was sent.', array( 'status' => 400 ) );
				}
				$res = builderlab_ds_save( $data, (string) $req->get_param( 'note' ) );
				return builderlab_rest_payload( array( 'warnings' => $res['warnings'], 'revisions' => builderlab_rest_revisions(), 'build' => $res['build'] ) );
			},
		),
	) );
	register_rest_route( 'builderlab/v1', '/design-system/restore', array(
		'methods'             => 'POST',
		'permission_callback' => 'builderlab_rest_can',
		'callback'            => function ( WP_REST_Request $req ) {
			$revs = builderlab_ds_revisions();
			$i    = (int) $req->get_param( 'index' );
			if ( ! isset( $revs[ $i ] ) ) {
				return new WP_Error( 'builderlab_no_revision', 'That revision does not exist.', array( 'status' => 404 ) );
			}
			$res = builderlab_ds_save( $revs[ $i ]['data'], 'Restored revision ' . $i );
			return builderlab_rest_payload( array( 'warnings' => $res['warnings'], 'revisions' => builderlab_rest_revisions() ) );
		},
	) );
} );

function builderlab_rest_revisions() {
	$out = array();
	foreach ( builderlab_ds_revisions() as $i => $r ) {
		$user  = get_userdata( (int) ( $r['user'] ?? 0 ) );
		$out[] = array(
			'index' => $i,
			'time'  => wp_date( 'j M Y, H:i', (int) $r['time'] ),
			'note'  => (string) ( $r['note'] ?? '' ),
			'user'  => $user ? $user->display_name : 'system',
			'brand' => (string) ( $r['data']['brand']['name'] ?? '' ),
		);
	}
	return $out;
}

/* ---------- Live style guide (shown in a frame on the design system screen) ---------- */

function builderlab_guide_block( $name, array $attrs = array(), $inner = null ) {
	$json = $attrs ? ' ' . wp_json_encode( $attrs, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) : '';
	if ( null === $inner ) {
		return '<!-- wp:builderlab/' . $name . $json . ' /-->';
	}
	return '<!-- wp:builderlab/' . $name . $json . ' -->' . implode( "\n", $inner ) . '<!-- /wp:builderlab/' . $name . ' -->';
}

function builderlab_guide_markup() {
	$b = 'builderlab_guide_block';
	$h = function ( $lvl, $text ) use ( $b ) {
		return $b( 'heading', array( 'level' => $lvl, 'content' => $text ) );
	};
	$t = function ( $text ) use ( $b ) {
		return $b( 'text', array( 'content' => $text ) );
	};
	$out = array();
	$out[] = $h( 1, 'Heading 1: the page title' );
	$out[] = $t( 'Body text uses the body font, size and line height. It includes <strong>strong</strong>, <em>emphasis</em> and <a href="#">a link</a>, so you can see how inline elements look.' );
	$out[] = $h( 2, 'Heading 2' );
	$out[] = $h( 3, 'Heading 3' );
	$out[] = $h( 4, 'Heading 4' );
	$out[] = $h( 5, 'Heading 5' );
	$out[] = $h( 6, 'Heading 6' );
	$out[] = $h( 2, 'Buttons' );
	$out[] = $b( 'container', array( 'layout' => 'row', 'gap' => 3 ), array(
		$b( 'button', array( 'content' => 'Primary button', 'url' => '#' ) ),
		$b( 'button', array( 'content' => 'Outline button', 'url' => '#', 'variant' => 'outline' ) ),
		$b( 'button', array( 'content' => 'Ghost button', 'url' => '#', 'variant' => 'ghost' ) ),
		$b( 'button', array( 'content' => 'Small', 'url' => '#', 'size' => 'sm' ) ),
		$b( 'button', array( 'content' => 'Large', 'url' => '#', 'size' => 'lg' ) ),
		$b( 'button', array( 'content' => 'Button element', 'kind' => 'button' ) ),
	) );
	$out[] = $h( 2, 'Lists and quote' );
	$out[] = $b( 'list', array( 'items' => "First item\nSecond item\nThird item" ) );
	$out[] = $b( 'quote', array( 'content' => 'A quotation that shows the quote style.', 'source' => 'Source name' ) );
	$out[] = $h( 2, 'Alerts' );
	foreach ( array( 'info' => 'Information', 'success' => 'Success', 'warning' => 'Warning', 'error' => 'Error' ) as $type => $word ) {
		$out[] = $b( 'alert', array( 'type' => $type, 'title' => $word . ' title', 'content' => 'A short message in the ' . strtolower( $word ) . ' style.' ) );
	}
	$out[] = $h( 2, 'Table' );
	$out[] = $b( 'table', array( 'caption' => 'Sample table', 'rowHeaders' => true, 'data' => "Item | Value | Status\nOne | 12 | Done\nTwo | 34 | Open" ) );
	$out[] = $h( 2, 'Accordion and tabs' );
	$out[] = $b( 'accordion', array( 'openFirst' => true, 'items' => array(
		array( 'title' => 'Accordion item one', 'content' => 'Content of the first item.' ),
		array( 'title' => 'Accordion item two', 'content' => 'Content of the second item.' ),
	) ) );
	$out[] = $b( 'tabs', array( 'label' => 'Sample tabs', 'level' => 3, 'items' => array(
		array( 'title' => 'First tab', 'content' => 'Content of the first tab.' ),
		array( 'title' => 'Second tab', 'content' => 'Content of the second tab.' ),
	) ) );
	$out[] = $h( 2, 'Navigation and search' );
	$out[] = $b( 'nav', array( 'label' => 'Sample navigation', 'items' => "Home | #\nProducts | #\n- Product one | #\n- Product two | #\nContact | #" ) );
	$out[] = $b( 'search', array( 'label' => 'Search this site', 'buttonText' => 'Search' ) );
	$out[] = $h( 2, 'Form' );
	$out[] = $b( 'form', array( 'formKey' => 'styleguide', 'submitLabel' => 'Send', 'fields' => array(
		array( 'type' => 'text', 'label' => 'Full name', 'required' => true, 'autocomplete' => 'name', 'help' => 'First and last name.', 'options' => '' ),
		array( 'type' => 'select', 'label' => 'Topic', 'required' => false, 'autocomplete' => '', 'help' => '', 'options' => 'General, Support' ),
		array( 'type' => 'radio', 'label' => 'Contact preference', 'required' => false, 'autocomplete' => '', 'help' => '', 'options' => 'Email, Phone' ),
		array( 'type' => 'checkbox', 'label' => 'I agree to the terms', 'required' => false, 'autocomplete' => '', 'help' => '', 'options' => '' ),
	) ) );
	return implode( "\n", $out );
}

add_action( 'admin_post_builderlab_style_guide', function () {
	if ( ! current_user_can( 'manage_options' ) || ! isset( $_GET['_wpnonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_GET['_wpnonce'] ) ), 'builderlab_style_guide' ) ) {
		wp_die( 'You are not allowed to see this page.', 'Not allowed', array( 'response' => 403 ) );
	}
	$ds     = builderlab_ds_get();
	$tokens = builderlab_ds_compile( $ds );
	$roles  = array();
	foreach ( builderlab_ds_resolve_roles( $ds ) as $role => $hex ) {
		$roles[] = '<li><span class="sw" style="background:var(--bl-color-' . esc_attr( $role ) . ')"></span><span>' . esc_html( $role ) . '</span></li>';
	}
	nocache_headers();
	header( 'Content-Type: text/html; charset=utf-8' );
	echo '<!doctype html><html lang="' . esc_attr( get_bloginfo( 'language' ) ) . '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Style guide</title>';
	echo '<style id="bl-guide-tokens">' . $tokens . '</style>'; // phpcs:ignore WordPress.Security.EscapeOutput
	echo '<link rel="stylesheet" href="' . esc_url( BUILDERLAB_URL . 'assets/frontend.css?ver=' . BUILDERLAB_VERSION ) . '">';
	echo '<style>html{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}body{margin:0;padding:1.25rem;background:var(--bl-color-bg);color:var(--bl-color-text);font-size:var(--bl-size-body);display:flex;flex-direction:column;gap:var(--bl-space-4)}.sg-roles{display:grid;grid-template-columns:repeat(auto-fill,minmax(9rem,1fr));gap:.5rem;margin:0;padding:0;list-style:none}.sg-roles li{display:flex;align-items:center;gap:.5rem;font-size:.8125rem}.sg-title{margin:0;font-weight:700}.sw{flex:none;width:2rem;height:2rem;border:1px solid #6b7280;border-radius:.25rem}</style>';
	echo '</head><body><p class="sg-title">Colors (roles)</p><ul class="sg-roles">' . implode( '', $roles ) . '</ul>'; // phpcs:ignore WordPress.Security.EscapeOutput
	echo do_blocks( builderlab_guide_markup() ); // phpcs:ignore WordPress.Security.EscapeOutput
	echo '<script src="' . esc_url( BUILDERLAB_URL . 'assets/tabs.js?ver=' . BUILDERLAB_VERSION ) . '" defer></script>';
	echo '<script src="' . esc_url( BUILDERLAB_URL . 'assets/nav.js?ver=' . BUILDERLAB_VERSION ) . '" defer></script>';
	echo '</body></html>';
	exit;
} );
