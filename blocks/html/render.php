<?php
/** @var array $attributes */
defined( 'ABSPATH' ) || exit;

$html = wp_kses( (string) ( $attributes['html'] ?? '' ), builderlab_allowed_html() );
if ( '' === trim( $html ) ) {
	return;
}
printf( '<div %1$s>%2$s</div>', builderlab_wrapper( 'bl-html', $attributes ), $html ); // phpcs:ignore WordPress.Security.EscapeOutput
