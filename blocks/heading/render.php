<?php
/** @var array $attributes */
defined( 'ABSPATH' ) || exit;

$level = max( 1, min( 6, (int) ( $attributes['level'] ?? 2 ) ) );
$text  = builderlab_kses( $attributes['content'] ?? '' );
if ( '' === trim( wp_strip_all_tags( $text ) ) ) {
	return;
}

$more   = array();
$anchor = sanitize_title( (string) ( $attributes['anchor'] ?? '' ) );
if ( '' !== $anchor ) {
	$more['id'] = $anchor;
}

printf(
	'<h%1$d %2$s>%3$s</h%1$d>',
	$level,
	builderlab_wrapper( 'bl-heading', $attributes, array(), $more ), // phpcs:ignore WordPress.Security.EscapeOutput
	$text // phpcs:ignore WordPress.Security.EscapeOutput
);
