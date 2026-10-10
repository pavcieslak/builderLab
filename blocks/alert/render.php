<?php
/** @var array $attributes */
defined( 'ABSPATH' ) || exit;

$words = builderlab_alert_words();
$type  = isset( $words[ $attributes['type'] ?? 'info' ] ) ? $attributes['type'] : 'info';
$title = trim( (string) ( $attributes['title'] ?? '' ) );
$body  = builderlab_paragraphs( $attributes['content'] ?? '' );
if ( '' === $title && '' === $body ) {
	return;
}
$head = '<p class="bl-alert__title"><strong>' . esc_html( $words[ $type ] ) . ( '' !== $title ? ':</strong> ' . esc_html( $title ) : '</strong>' ) . '</p>';
printf(
	'<div %1$s>%2$s%3$s</div>',
	builderlab_wrapper( 'bl-alert is-' . $type, $attributes, array(), array( 'role' => 'note' ) ), // phpcs:ignore WordPress.Security.EscapeOutput
	$head, // phpcs:ignore WordPress.Security.EscapeOutput
	$body // phpcs:ignore WordPress.Security.EscapeOutput
);
