<?php
/**
 * BuilderLab templates: header, footer and reusable components, with display conditions.
 * A template is a normal post of a private type; its content is block markup like any page.
 */
defined( 'ABSPATH' ) || exit;

const BUILDERLAB_TEMPLATE_CPT  = 'builderlab_template';
const BUILDERLAB_TPL_TYPE_META = '_bl_template_type';
const BUILDERLAB_TPL_COND_META = '_bl_conditions';
const BUILDERLAB_TPL_PRIO_META = '_bl_priority';

add_action( 'init', function () {
	register_post_type( BUILDERLAB_TEMPLATE_CPT, array(
		'labels'          => array(
			'name'          => 'Templates',
			'singular_name' => 'Template',
			'add_new_item'  => 'Add template',
			'edit_item'     => 'Edit template',
			'search_items'  => 'Search templates',
			'not_found'     => 'No templates yet.',
		),
		'public'          => false,
		'show_ui'         => true,
		'show_in_menu'    => 'builderlab-design-system',
		'show_in_rest'    => false,
		'supports'        => array( 'title', 'editor', 'revisions' ),
		'capability_type' => 'page',
		'map_meta_cap'    => true,
	) );
} );

function builderlab_template_types() {
	return array(
		'header'    => 'Header',
		'footer'    => 'Footer',
		'component' => 'Component (reusable section)',
	);
}

function builderlab_condition_rules() {
	return array( 'site', 'front_page', 'blog', 'singular', 'archive', 'search', 'not_found', 'logged_in', 'logged_out', 'role' );
}

/* ---------- Data ---------- */

function builderlab_template_type( $post_id ) {
	$type = (string) get_post_meta( $post_id, BUILDERLAB_TPL_TYPE_META, true );
	return isset( builderlab_template_types()[ $type ] ) ? $type : 'component';
}

/** Cleans a list of display conditions. */
function builderlab_clean_conditions( $raw ) {
	$out = array();
	foreach ( (array) $raw as $c ) {
		if ( ! is_array( $c ) ) {
			continue;
		}
		$rule = isset( $c['rule'] ) ? sanitize_key( $c['rule'] ) : '';
		if ( ! in_array( $rule, builderlab_condition_rules(), true ) ) {
			continue;
		}
		$out[] = array(
			'mode'    => ( isset( $c['mode'] ) && 'exclude' === $c['mode'] ) ? 'exclude' : 'include',
			'rule'    => $rule,
			'subtype' => isset( $c['subtype'] ) ? preg_replace( '/[^A-Za-z0-9_\-]/', '', (string) $c['subtype'] ) : '',
			'value'   => isset( $c['value'] ) ? preg_replace( '/[^A-Za-z0-9_,\- ]/', '', (string) $c['value'] ) : '',
		);
	}
	return array_slice( $out, 0, 30 );
}

function builderlab_template_conditions( $post_id ) {
	$raw = get_post_meta( $post_id, BUILDERLAB_TPL_COND_META, true );
	$arr = is_string( $raw ) ? json_decode( $raw, true ) : $raw;
	return builderlab_clean_conditions( is_array( $arr ) ? $arr : array() );
}

function builderlab_template_priority( $post_id ) {
	$p = get_post_meta( $post_id, BUILDERLAB_TPL_PRIO_META, true );
	return is_numeric( $p ) ? (int) $p : 10;
}

/** Saves type, conditions and priority (used by the editor). */
function builderlab_save_template_settings( $post_id, array $data ) {
	if ( isset( $data['type'] ) && isset( builderlab_template_types()[ $data['type'] ] ) ) {
		update_post_meta( $post_id, BUILDERLAB_TPL_TYPE_META, $data['type'] );
	}
	if ( isset( $data['conditions'] ) ) {
		update_post_meta( $post_id, BUILDERLAB_TPL_COND_META, wp_slash( wp_json_encode( builderlab_clean_conditions( $data['conditions'] ) ) ) );
	}
	if ( isset( $data['priority'] ) && is_numeric( $data['priority'] ) ) {
		update_post_meta( $post_id, BUILDERLAB_TPL_PRIO_META, max( 0, min( 999, (int) $data['priority'] ) ) );
	}
}

/* ---------- Conditions ---------- */

/** What is being shown, from the main query. Tests and the "which template applies" check pass their own. */
function builderlab_current_context() {
	$user = wp_get_current_user();
	$ctx  = array(
		'logged_in'         => is_user_logged_in(),
		'roles'             => (array) $user->roles,
		'front_page'        => is_front_page(),
		'blog'              => is_home(),
		'search'            => is_search(),
		'not_found'         => is_404(),
		'singular'          => is_singular(),
		'post_id'           => 0,
		'post_type'         => '',
		'archive'           => is_archive() || is_home(),
		'post_type_archive' => '',
		'taxonomy'          => '',
		'term_ids'          => array(),
	);
	if ( $ctx['singular'] ) {
		$ctx['post_id']   = (int) get_queried_object_id();
		$ctx['post_type'] = (string) get_post_type( $ctx['post_id'] );
	}
	if ( is_post_type_archive() ) {
		$ctx['post_type_archive'] = (string) get_query_var( 'post_type' );
	}
	if ( is_category() || is_tag() || is_tax() ) {
		$obj = get_queried_object();
		if ( $obj && isset( $obj->taxonomy ) ) {
			$ctx['taxonomy'] = $obj->taxonomy;
			$ctx['term_ids'] = array( (int) $obj->term_id );
		}
	}
	return $ctx;
}

/** Context for a given post, as if it were the single page being viewed. */
function builderlab_context_for_post( $post_id ) {
	$user = wp_get_current_user();
	return array(
		'logged_in' => is_user_logged_in(), 'roles' => (array) $user->roles, 'front_page' => ( 'page' === get_option( 'show_on_front' ) && (int) get_option( 'page_on_front' ) === (int) $post_id ),
		'blog' => false, 'search' => false, 'not_found' => false, 'singular' => true, 'post_id' => (int) $post_id, 'post_type' => (string) get_post_type( $post_id ),
		'archive' => false, 'post_type_archive' => '', 'taxonomy' => '', 'term_ids' => array(),
	);
}

/** Score of one condition for a context: 0 when it does not apply. More specific means a higher score. */
function builderlab_condition_score( array $c, array $ctx ) {
	$ids = array_filter( array_map( 'intval', preg_split( '/[\s,]+/', (string) $c['value'] ) ) );
	switch ( $c['rule'] ) {
		case 'site':
			return 10;
		case 'front_page':
			return $ctx['front_page'] ? 90 : 0;
		case 'blog':
			return $ctx['blog'] ? 70 : 0;
		case 'singular':
			if ( ! $ctx['singular'] ) {
				return 0;
			}
			if ( $ids ) {
				return in_array( (int) $ctx['post_id'], $ids, true ) ? 100 : 0;
			}
			if ( '' === $c['subtype'] || 'all' === $c['subtype'] ) {
				return 40;
			}
			return $c['subtype'] === $ctx['post_type'] ? 60 : 0;
		case 'archive':
			if ( ! $ctx['archive'] ) {
				return 0;
			}
			if ( '' === $c['subtype'] || 'all' === $c['subtype'] ) {
				return 40;
			}
			if ( $c['subtype'] === $ctx['post_type_archive'] ) {
				return 60;
			}
			if ( $c['subtype'] === $ctx['taxonomy'] ) {
				return $ids ? ( array_intersect( $ids, $ctx['term_ids'] ) ? 80 : 0 ) : 60;
			}
			return 0;
		case 'search':
			return $ctx['search'] ? 50 : 0;
		case 'not_found':
			return $ctx['not_found'] ? 50 : 0;
		case 'logged_in':
			return $ctx['logged_in'] ? 20 : 0;
		case 'logged_out':
			return $ctx['logged_in'] ? 0 : 20;
		case 'role':
			return in_array( $c['value'], $ctx['roles'], true ) ? 20 : 0;
	}
	return 0;
}

/** Score of a whole template: 0 when it does not apply (no include matches, or an exclude matches). */
function builderlab_template_score( array $conditions, array $ctx ) {
	$best = 0;
	foreach ( $conditions as $c ) {
		$score = builderlab_condition_score( $c, $ctx );
		if ( 'exclude' === $c['mode'] && $score > 0 ) {
			return 0;
		}
		if ( 'include' === $c['mode'] ) {
			$best = max( $best, $score );
		}
	}
	return $best;
}

/** The template that applies: highest score, then highest priority, then the newest. */
function builderlab_find_template( $type, array $ctx ) {
	$posts = get_posts( array(
		'post_type'      => BUILDERLAB_TEMPLATE_CPT,
		'post_status'    => 'publish',
		'posts_per_page' => 100,
		'no_found_rows'  => true,
		'meta_key'       => BUILDERLAB_TPL_TYPE_META, // phpcs:ignore WordPress.DB.SlowDBQuery
		'meta_value'     => $type, // phpcs:ignore WordPress.DB.SlowDBQuery
	) );
	$best = null;
	foreach ( $posts as $p ) {
		$score = builderlab_template_score( builderlab_template_conditions( $p->ID ), $ctx );
		if ( $score <= 0 ) {
			continue;
		}
		$key = array( $score, builderlab_template_priority( $p->ID ), $p->ID );
		if ( null === $best || $key > $best['key'] ) {
			$best = array( 'key' => $key, 'post' => $p, 'score' => $score );
		}
	}
	return $best ? $best['post'] : null;
}

/** The template for the page being shown (cached for the request). */
function builderlab_active_template( $type ) {
	static $cache = array();
	if ( ! array_key_exists( $type, $cache ) ) {
		$cache[ $type ] = builderlab_find_template( $type, builderlab_current_context() );
	}
	return $cache[ $type ];
}

/* ---------- Rendering ---------- */

/** Renders a template's blocks. A template that contains itself is skipped. */
function builderlab_render_template( $post ) {
	static $stack = array();
	$post = get_post( $post );
	if ( ! $post || BUILDERLAB_TEMPLATE_CPT !== $post->post_type || in_array( $post->ID, $stack, true ) || count( $stack ) > 5 ) {
		return '';
	}
	$stack[] = $post->ID;
	$html    = do_blocks( $post->post_content );
	array_pop( $stack );
	return $html;
}

function builderlab_template_wrapper( $post, $tag, $class ) {
	return sprintf( '<%1$s class="wp-block-template-part bl-site-%2$s">%3$s</%1$s>', $tag, esc_attr( $class ), builderlab_render_template( $post ) );
}

/** Block themes: the header and footer template parts are replaced. */
add_filter( 'render_block_core/template-part', function ( $content, $block ) {
	if ( is_admin() || is_feed() ) {
		return $content;
	}
	$attrs = $block['attrs'] ?? array();
	$area  = (string) ( $attrs['area'] ?? '' );
	$slug  = (string) ( $attrs['slug'] ?? '' );
	$type  = ( 'header' === $area || 'header' === $slug ) ? 'header' : ( ( 'footer' === $area || 'footer' === $slug ) ? 'footer' : '' );
	if ( '' === $type ) {
		return $content;
	}
	$tpl = builderlab_active_template( $type );
	return $tpl ? builderlab_template_wrapper( $tpl, $attrs['tagName'] ?? $type, $type ) : $content;
}, 10, 2 );

/** Classic themes: header.php and footer.php are replaced with the same technique as other builders use. */
add_action( 'get_header', function ( $name ) {
	if ( wp_is_block_theme() || is_admin() ) {
		return;
	}
	$tpl = builderlab_active_template( 'header' );
	if ( ! $tpl ) {
		return;
	}
	?><!doctype html><html <?php language_attributes(); ?>><head><meta charset="<?php bloginfo( 'charset' ); ?>"><meta name="viewport" content="width=device-width, initial-scale=1"><?php wp_head(); ?></head><body <?php body_class(); ?>><?php
	wp_body_open();
	echo builderlab_template_wrapper( $tpl, 'header', 'header' ); // phpcs:ignore WordPress.Security.EscapeOutput
	// Load the theme header into a buffer and drop it, so that get_header() skips it (require_once).
	remove_all_actions( 'wp_head' );
	$names = $name ? array( "header-{$name}.php", 'header.php' ) : array( 'header.php' );
	ob_start();
	locate_template( $names, true, true );
	ob_end_clean();
} );

add_action( 'get_footer', function ( $name ) {
	if ( wp_is_block_theme() || is_admin() ) {
		return;
	}
	$tpl = builderlab_active_template( 'footer' );
	if ( ! $tpl ) {
		return;
	}
	echo builderlab_template_wrapper( $tpl, 'footer', 'footer' ); // phpcs:ignore WordPress.Security.EscapeOutput
	wp_footer();
	echo '</body></html>';
	remove_all_actions( 'wp_footer' );
	$names = $name ? array( "footer-{$name}.php", 'footer.php' ) : array( 'footer.php' );
	ob_start();
	locate_template( $names, true, true );
	ob_end_clean();
} );

/* ---------- Admin: columns and quick add ---------- */

add_filter( 'manage_' . BUILDERLAB_TEMPLATE_CPT . '_posts_columns', function ( $cols ) {
	return array( 'cb' => $cols['cb'], 'title' => 'Title', 'bl_type' => 'Type', 'bl_where' => 'Shown on', 'bl_prio' => 'Priority', 'date' => 'Date' );
} );

add_action( 'manage_' . BUILDERLAB_TEMPLATE_CPT . '_posts_custom_column', function ( $col, $post_id ) {
	if ( 'bl_type' === $col ) {
		echo esc_html( builderlab_template_types()[ builderlab_template_type( $post_id ) ] );
	} elseif ( 'bl_where' === $col ) {
		$c = builderlab_template_conditions( $post_id );
		echo $c ? esc_html( builderlab_conditions_summary( $c ) ) : '<em>Not shown anywhere yet</em>'; // phpcs:ignore WordPress.Security.EscapeOutput
	} elseif ( 'bl_prio' === $col ) {
		echo (int) builderlab_template_priority( $post_id );
	}
}, 10, 2 );

function builderlab_conditions_summary( array $conditions ) {
	$labels = array(
		'site' => 'Entire site', 'front_page' => 'Front page', 'blog' => 'Posts page', 'singular' => 'Single', 'archive' => 'Archive', 'search' => 'Search results',
		'not_found' => '404 page', 'logged_in' => 'Logged-in users', 'logged_out' => 'Logged-out visitors', 'role' => 'Role',
	);
	$parts = array();
	foreach ( $conditions as $c ) {
		$text = $labels[ $c['rule'] ] ?? $c['rule'];
		if ( '' !== $c['subtype'] && 'all' !== $c['subtype'] ) {
			$text .= ': ' . $c['subtype'];
		}
		if ( '' !== $c['value'] ) {
			$text .= ' (' . $c['value'] . ')';
		}
		$parts[] = ( 'exclude' === $c['mode'] ? 'Not ' : '' ) . $text;
	}
	return implode( '; ', $parts );
}

add_action( 'admin_notices', function () {
	$screen = get_current_screen();
	if ( ! $screen || 'edit-' . BUILDERLAB_TEMPLATE_CPT !== $screen->id ) {
		return;
	}
	echo '<div class="notice notice-info"><p><strong>Add a template:</strong> ';
	foreach ( builderlab_template_types() as $type => $label ) {
		printf( '<a class="button" style="margin-right:6px" href="%s">%s</a>', esc_url( admin_url( 'post-new.php?post_type=' . BUILDERLAB_TEMPLATE_CPT . '&bl_type=' . $type ) ), esc_html( $label ) );
	}
	echo '</p><p class="description">A header or footer replaces the theme\'s own where its conditions match. The most specific condition wins; ties go to the higher priority.</p></div>';
} );

/* ---------- REST ---------- */

add_action( 'rest_api_init', function () {
	register_rest_route( 'builderlab/v1', '/templates', array(
		'methods'             => 'GET',
		'permission_callback' => function () {
			return current_user_can( 'edit_posts' );
		},
		'callback'            => function ( WP_REST_Request $req ) {
			$type  = sanitize_key( (string) $req->get_param( 'type' ) );
			$posts = get_posts( array( 'post_type' => BUILDERLAB_TEMPLATE_CPT, 'post_status' => array( 'publish', 'draft' ), 'posts_per_page' => 100, 'orderby' => 'title', 'order' => 'ASC', 'no_found_rows' => true ) );
			$out   = array();
			foreach ( $posts as $p ) {
				if ( '' === $type || builderlab_template_type( $p->ID ) === $type ) {
					$out[] = array( 'id' => $p->ID, 'title' => get_the_title( $p ) ?: '(no title)', 'type' => builderlab_template_type( $p->ID ), 'status' => $p->post_status );
				}
			}
			return $out;
		},
	) );

	// Which header and footer apply to a given page (for the editor).
	register_rest_route( 'builderlab/v1', '/templates/resolve', array(
		'methods'             => 'GET',
		'permission_callback' => function () {
			return current_user_can( 'edit_posts' );
		},
		'callback'            => function ( WP_REST_Request $req ) {
			$post_id = (int) $req->get_param( 'post' );
			if ( ! $post_id || ! get_post( $post_id ) ) {
				return new WP_Error( 'builderlab_no_post', 'Choose a page.', array( 'status' => 404 ) );
			}
			$ctx = builderlab_context_for_post( $post_id );
			$out = array( 'page' => get_the_title( $post_id ) );
			foreach ( array( 'header', 'footer' ) as $type ) {
				$t           = builderlab_find_template( $type, $ctx );
				$out[ $type ] = $t ? array( 'id' => $t->ID, 'title' => get_the_title( $t ) ) : null;
			}
			return $out;
		},
	) );
} );
