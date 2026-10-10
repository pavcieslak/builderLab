<?php
/** @var array $attributes */
defined( 'ABSPATH' ) || exit;

$items = builderlab_lines( $attributes['items'] ?? '' );
if ( ! $items ) {
	return;
}
$tag = ! empty( $attributes['ordered'] ) ? 'ol' : 'ul';
$li  = '';
foreach ( $items as $item ) {
	$li .= '<li>' . builderlab_kses( $item ) . '</li>';
}
printf( '<%1$s %2$s>%3$s</%1$s>', $tag, builderlab_wrapper( 'bl-list', $attributes ), $li ); // phpcs:ignore WordPress.Security.EscapeOutput
