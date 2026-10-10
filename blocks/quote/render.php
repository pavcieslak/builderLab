<?php
/** @var array $attributes */
defined( 'ABSPATH' ) || exit;

$text   = builderlab_kses( $attributes['content'] ?? '' );
$source = builderlab_kses( $attributes['source'] ?? '' );
if ( '' === trim( wp_strip_all_tags( $text ) ) ) {
	return;
}
$caption = '' !== trim( wp_strip_all_tags( $source ) ) ? '<figcaption class="bl-quote__source">' . $source . '</figcaption>' : '';
printf(
	'<figure %1$s><blockquote class="bl-quote__text"><p>%2$s</p></blockquote>%3$s</figure>',
	builderlab_wrapper( 'bl-quote', $attributes ), // phpcs:ignore WordPress.Security.EscapeOutput
	$text, // phpcs:ignore WordPress.Security.EscapeOutput
	$caption // phpcs:ignore WordPress.Security.EscapeOutput
);
