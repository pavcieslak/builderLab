<?php
/**
 * BuilderLab settings and the "Edit with BuilderLab" entry points.
 */
defined( 'ABSPATH' ) || exit;

const BUILDERLAB_SETTINGS_OPTION = 'builderlab_settings';
const BUILDERLAB_MODE_META       = '_builderlab_mode';

/** Post types that can never be edited with BuilderLab. */
function builderlab_excluded_post_types() {
	return array(
		'attachment', 'revision', 'nav_menu_item', 'custom_css', 'customize_changeset', 'oembed_cache', 'user_request',
		'wp_block', 'wp_template', 'wp_template_part', 'wp_global_styles', 'wp_navigation', 'wp_font_family', 'wp_font_face',
		'builderlab_entry', 'builderlab_template',
	);
}

/** Post types that can be chosen on the settings page: everything with an admin screen and a content field. */
function builderlab_candidate_post_types() {
	$out = array();
	foreach ( get_post_types( array( 'show_ui' => true ), 'objects' ) as $name => $type ) {
		if ( in_array( $name, builderlab_excluded_post_types(), true ) || ! post_type_supports( $name, 'editor' ) ) {
			continue;
		}
		$out[ $name ] = $type;
	}
	return $out;
}

function builderlab_settings() {
	$stored = get_option( BUILDERLAB_SETTINGS_OPTION );
	$stored = is_array( $stored ) ? $stored : array();
	$types  = ( isset( $stored['post_types'] ) && is_array( $stored['post_types'] ) ) ? $stored['post_types'] : array( 'page' );
	return array(
		'post_types'        => array_values( array_map( 'sanitize_key', $types ) ),
		// New content starts in BuilderLab unless this is switched off.
		'new_in_builderlab' => array_key_exists( 'new_in_builderlab', $stored ) ? (bool) $stored['new_in_builderlab'] : true,
	);
}

function builderlab_enabled_post_types() {
	$chosen = array_values( array_intersect( builderlab_settings()['post_types'], array_keys( builderlab_candidate_post_types() ) ) );
	$chosen[] = 'builderlab_template'; // Templates are always edited with BuilderLab.
	return $chosen;
}

function builderlab_can_edit_post( $post ) {
	$post = get_post( $post );
	return $post
		&& in_array( $post->post_type, builderlab_enabled_post_types(), true )
		&& 'trash' !== $post->post_status
		&& current_user_can( 'edit_post', $post->ID );
}

function builderlab_editor_url( $post_id ) {
	return admin_url( 'admin.php?page=builderlab-editor&post=' . (int) $post_id );
}

/* ---------- Settings page ---------- */

add_action( 'admin_init', function () {
	register_setting( 'builderlab_settings_group', BUILDERLAB_SETTINGS_OPTION, array(
		'type'              => 'array',
		'default'           => array( 'post_types' => array( 'page' ) ),
		'sanitize_callback' => function ( $input ) {
			$allowed = array_keys( builderlab_candidate_post_types() );
			$chosen  = ( is_array( $input ) && isset( $input['post_types'] ) && is_array( $input['post_types'] ) ) ? $input['post_types'] : array();
			$chosen  = array_values( array_intersect( array_map( 'sanitize_key', $chosen ), $allowed ) );
			return array( 'post_types' => $chosen, 'new_in_builderlab' => ! empty( $input['new_in_builderlab'] ) );
		},
	) );
} );

add_action( 'admin_menu', function () {
	add_submenu_page( 'builderlab-design-system', 'BuilderLab settings', 'Settings', 'manage_options', 'builderlab-settings', 'builderlab_render_settings_page' );
}, 20 );

function builderlab_render_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$enabled = builderlab_enabled_post_types();
	echo '<div class="wrap"><h1>BuilderLab settings</h1>';
	if ( isset( $_GET['settings-updated'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification
		echo '<div class="notice notice-success is-dismissible" role="status"><p>Settings saved.</p></div>';
	}
	echo '<form method="post" action="options.php">';
	settings_fields( 'builderlab_settings_group' );
	echo '<fieldset><legend><h2 style="display:inline">Edit with BuilderLab</h2></legend>';
	echo '<p id="bl-pt-help">Choose the content types that get the <strong>Edit with BuilderLab</strong> button in their lists, on their edit screen and in the admin bar.</p>';
	echo '<ul style="margin:0 0 16px" aria-describedby="bl-pt-help">';
	foreach ( builderlab_candidate_post_types() as $name => $type ) {
		$count = wp_count_posts( $name );
		$total = isset( $count->publish ) ? (int) $count->publish + (int) ( $count->draft ?? 0 ) : 0;
		printf(
			'<li style="margin:0 0 8px"><label><input type="checkbox" name="%1$s[post_types][]" value="%2$s" %3$s> %4$s <code>%2$s</code> <span class="description">(%5$d items%6$s)</span></label></li>',
			esc_attr( BUILDERLAB_SETTINGS_OPTION ),
			esc_attr( $name ),
			checked( in_array( $name, $enabled, true ), true, false ),
			esc_html( $type->labels->name ),
			$total,
			$type->_builtin ? '' : ', custom type'
		);
	}
	echo '</ul></fieldset>';
	echo '<fieldset><legend><h2 style="display:inline">New content</h2></legend>';
	printf(
		'<p><label><input type="checkbox" name="%1$s[new_in_builderlab]" value="1" %2$s> Start new content in BuilderLab</label></p>',
		esc_attr( BUILDERLAB_SETTINGS_OPTION ),
		checked( builderlab_settings()['new_in_builderlab'], true, false )
	);
	echo '<p class="description">When this is on, <strong>Add New</strong> for the content types above opens the BuilderLab editor straight away. To open the default editor once, add <code>&amp;builderlab=off</code> to the Add New address.</p></fieldset>';
	submit_button( 'Save settings' );
	echo '</form>';
	echo '<hr><h2>About the editor</h2><p>BuilderLab stores pages as standard WordPress block markup, so your content stays readable if the plugin is removed. If you switch the WordPress block editor off with another plugin, pages that were built with BuilderLab show an <strong>Edit with BuilderLab</strong> button in place of the classic editor.</p></div>';
}

/* ---------- Entry points ---------- */

foreach ( array( 'post_row_actions', 'page_row_actions' ) as $builderlab_filter ) {
	add_filter( $builderlab_filter, function ( $actions, $post ) {
		if ( builderlab_can_edit_post( $post ) ) {
			$actions['builderlab'] = '<a href="' . esc_url( builderlab_editor_url( $post->ID ) ) . '" aria-label="' . esc_attr( sprintf( 'Edit "%s" with BuilderLab', get_the_title( $post ) ) ) . '">Edit with BuilderLab</a>';
		}
		return $actions;
	}, 10, 2 );
}

add_action( 'admin_bar_menu', function ( $bar ) {
	if ( is_admin() || ! is_singular() || ! builderlab_can_edit_post( get_queried_object_id() ) ) {
		return;
	}
	$bar->add_node( array(
		'id'    => 'builderlab-edit',
		'title' => 'Edit with BuilderLab',
		'href'  => builderlab_editor_url( get_queried_object_id() ),
	) );
}, 80 );

/** On the classic edit screen: a clear button, and the editor is replaced for pages built with BuilderLab. */
add_action( 'edit_form_after_title', function ( $post ) {
	if ( ! builderlab_can_edit_post( $post ) ) {
		return;
	}
	$locked  = (bool) get_post_meta( $post->ID, BUILDERLAB_MODE_META, true );
	$release = wp_nonce_url( admin_url( 'admin-post.php?action=builderlab_release&post=' . (int) $post->ID ), 'builderlab_release_' . (int) $post->ID );
	echo '<div class="builderlab-classic-entry" style="margin:12px 0;padding:16px;background:#fff;border:1px solid #c3c4c7;border-left:4px solid #2271b1">';
	echo '<p style="margin:0 0 12px"><strong>' . ( $locked ? 'This page was built with BuilderLab.' : 'Build this page visually.' ) . '</strong></p>';
	echo '<a class="button button-primary button-hero" href="' . esc_url( builderlab_editor_url( $post->ID ) ) . '">Edit with BuilderLab</a>';
	if ( $locked ) {
		echo ' <a class="button" href="' . esc_url( $release ) . '">Go back to the default editor</a>';
		echo '<p class="description" style="margin-top:12px">The default editor is hidden so that BuilderLab content is not changed by accident.</p>';
		echo '<style>#postdivrich,#wp-content-editor-tools,#post-status-info{display:none!important}</style>';
	}
	echo '</div>';
} );

add_action( 'admin_post_builderlab_release', function () {
	$post_id = (int) ( $_GET['post'] ?? 0 );
	check_admin_referer( 'builderlab_release_' . $post_id );
	if ( ! current_user_can( 'edit_post', $post_id ) ) {
		wp_die( 'You are not allowed to do this.', 'Not allowed', array( 'response' => 403 ) );
	}
	delete_post_meta( $post_id, BUILDERLAB_MODE_META );
	wp_safe_redirect( get_edit_post_link( $post_id, 'raw' ) );
	exit;
} );

/** Add New for an enabled content type opens BuilderLab instead of the default editor. */
add_action( 'load-post-new.php', function () {
	$type = isset( $_GET['post_type'] ) ? sanitize_key( wp_unslash( $_GET['post_type'] ) ) : 'post'; // phpcs:ignore WordPress.Security.NonceVerification
	if ( isset( $_GET['builderlab'] ) && 'off' === $_GET['builderlab'] ) { // phpcs:ignore WordPress.Security.NonceVerification
		return;
	}
	if ( ! builderlab_settings()['new_in_builderlab'] || ! in_array( $type, builderlab_enabled_post_types(), true ) ) {
		return;
	}
	$object = get_post_type_object( $type );
	if ( ! $object || ! current_user_can( $object->cap->create_posts ) ) {
		return;
	}
	$post = get_default_post_to_edit( $type, true ); // Creates the empty draft WordPress would have created.
	if ( 'builderlab_template' === $type ) {
		$bl_type = isset( $_GET['bl_type'] ) ? sanitize_key( wp_unslash( $_GET['bl_type'] ) ) : 'component'; // phpcs:ignore WordPress.Security.NonceVerification
		$bl_type = isset( builderlab_template_types()[ $bl_type ] ) ? $bl_type : 'component';
		update_post_meta( $post->ID, BUILDERLAB_TPL_TYPE_META, $bl_type );
		update_post_meta( $post->ID, '_bl_suggested_title', ucfirst( $bl_type ) . ' template' );
	}
	wp_safe_redirect( builderlab_editor_url( $post->ID ) );
	exit;
} );
