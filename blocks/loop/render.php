<?php
/** @var array $attributes */
defined( 'ABSPATH' ) || exit;

$types = builderlab_loop_post_types();
$type  = sanitize_key( (string) ( $attributes['postType'] ?? 'post' ) );
$type  = isset( $types[ $type ] ) ? $type : 'post';
$per   = max( 1, min( 24, (int) ( $attributes['perPage'] ?? 6 ) ) );
$mode  = (string) ( $attributes['pagination'] ?? 'numbered' );
$mode  = in_array( $mode, array( 'none', 'numbered', 'prevnext' ), true ) ? $mode : 'numbered';
$level = max( 2, min( 6, (int) ( $attributes['headingLevel'] ?? 3 ) ) );
$key   = preg_replace( '/[^a-z0-9]/', '', strtolower( (string) ( $attributes['loopKey'] ?? '' ) ) );
$param = 'bl-p-' . ( '' !== $key ? $key : 'l' );
$paged = isset( $_GET[ $param ] ) ? max( 1, (int) $_GET[ $param ] ) : 1; // phpcs:ignore WordPress.Security.NonceVerification

$order_by = (string) ( $attributes['orderBy'] ?? 'date' );
$order_by = in_array( $order_by, array( 'date', 'title', 'modified', 'menu_order' ), true ) ? $order_by : 'date';
$args     = array(
	'post_type'           => $type,
	'post_status'         => 'publish',
	'posts_per_page'      => $per,
	'paged'               => 'none' === $mode ? 1 : $paged,
	'orderby'             => $order_by,
	'order'               => 'ASC' === ( $attributes['order'] ?? 'DESC' ) ? 'ASC' : 'DESC',
	'ignore_sticky_posts' => true,
	'no_found_rows'       => 'none' === $mode,
);
$current = (int) get_the_ID();
if ( $current && get_post_type( $current ) === $type ) {
	$args['post__not_in'] = array( $current ); // A list never contains the page that shows it.
}
$taxonomy = sanitize_key( (string) ( $attributes['taxonomy'] ?? '' ) );
$slugs    = array_filter( array_map( 'sanitize_title', explode( ',', (string) ( $attributes['terms'] ?? '' ) ) ) );
if ( $taxonomy && $slugs && is_object_in_taxonomy( $type, $taxonomy ) ) {
	$args['tax_query'] = array( array( 'taxonomy' => $taxonomy, 'field' => 'slug', 'terms' => array_values( $slugs ) ) ); // phpcs:ignore WordPress.DB.SlowDBQuery
}

// The card: only known fields are kept.
$items = array();
foreach ( (array) ( $attributes['card'] ?? array() ) as $raw ) {
	$field = is_array( $raw ) ? builderlab_loop_clean_field( $raw['field'] ?? '' ) : '';
	if ( '' === $field ) {
		continue;
	}
	$items[] = array(
		'field' => $field,
		'link'  => ! empty( $raw['link'] ),
		'text'  => sanitize_text_field( (string) ( $raw['text'] ?? '' ) ),
	);
}

$query = new WP_Query( $args );
$cols  = array(
	'--bl-cols'   => max( 1, min( 6, (int) ( $attributes['columns'] ?? 3 ) ) ),
	'--bl-cols-t' => max( 1, min( 6, (int) ( $attributes['columnsTablet'] ?? 2 ) ) ),
	'--bl-cols-m' => max( 1, min( 4, (int) ( $attributes['columnsMobile'] ?? 1 ) ) ),
);
$name  = trim( (string) ( $attributes['label'] ?? '' ) );
$more  = array();
$ajax  = ! empty( $attributes['ajax'] ) && 'none' !== $mode;
if ( $ajax ) {
	// Pagination loads in place. The links stay real links, so it still works without scripts.
	wp_enqueue_script( 'builderlab-loop' );
	$more['data-bl-ajax'] = '1';
	$more['data-bl-key']  = '' !== $key ? $key : 'l';
}
if ( '' !== $name ) {
	$more['role']       = 'region';
	$more['aria-label'] = $name;
}

$body = '';
if ( ! $query->have_posts() || ! $items ) {
	$body = '<p class="bl-loop__empty">' . esc_html( (string) ( $attributes['empty'] ?? 'Nothing to show yet.' ) ) . '</p>';
} else {
	$body = '<ul class="bl-loop__list">';
	foreach ( $query->posts as $item_post ) {
		$body .= builderlab_loop_card( $item_post, $items, $level ); // phpcs:ignore WordPress.Security.EscapeOutput
	}
	$body .= '</ul>';
	$total = (int) $query->max_num_pages;
	if ( 'none' !== $mode && $total > 1 ) {
		$base  = remove_query_arg( $param );
		if ( 'prevnext' === $mode ) {
			$links = '<ul class="page-numbers">';
			if ( $paged > 1 ) {
				$links .= '<li><a class="prev page-numbers" href="' . esc_url( $paged - 1 > 1 ? add_query_arg( $param, $paged - 1, $base ) : $base ) . '">Previous<span class="bl-sr-only"> page</span></a></li>';
			}
			$links .= '<li><span class="page-numbers">Page ' . (int) $paged . ' of ' . $total . '</span></li>';
			if ( $paged < $total ) {
				$links .= '<li><a class="next page-numbers" href="' . esc_url( add_query_arg( $param, $paged + 1, $base ) ) . '">Next<span class="bl-sr-only"> page</span></a></li>';
			}
			$links .= '</ul>';
		} else {
			$links = paginate_links( array(
				'base'      => esc_url_raw( add_query_arg( $param, '%#%', $base ) ),
				'format'    => '',
				'current'   => $paged,
				'total'     => $total,
				'type'      => 'list',
				'mid_size'  => 1,
				'end_size'  => 1,
				'prev_text' => 'Previous<span class="bl-sr-only"> page</span>',
				'next_text' => 'Next<span class="bl-sr-only"> page</span>',
			) );
		}
		if ( $links ) {
			$body .= '<nav class="bl-pagination" aria-label="Pagination">' . $links . '</nav>';
		}
	}
}
wp_reset_postdata();
$status = $ajax ? '<p class="bl-sr-only" role="status" aria-live="polite"></p>' : '';
printf( '<div %1$s><div class="bl-loop__body">%2$s</div>%3$s</div>', builderlab_wrapper( 'bl-loop', $attributes, $cols, $more ), $body, $status ); // phpcs:ignore WordPress.Security.EscapeOutput
