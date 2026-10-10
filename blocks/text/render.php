<?php
/** @var array $attributes */
defined( 'ABSPATH' ) || exit;

$text = builderlab_kses( $attributes['content'] ?? '' );
if ( '' === trim( wp_strip_all_tags( $text ) ) ) {
	return;
}

printf(
	'<p %1$s>%2$s</p>',
	builderlab_wrapper( 'bl-text', $attributes ), // phpcs:ignore WordPress.Security.EscapeOutput
	$text // phpcs:ignore WordPress.Security.EscapeOutput
);
