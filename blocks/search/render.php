<?php
/** @var array $attributes */
defined( 'ABSPATH' ) || exit;

$label = trim( (string) ( $attributes['label'] ?? '' ) );
if ( '' === $label ) {
	return;
}
$btn = trim( (string) ( $attributes['buttonText'] ?? '' ) ) ?: 'Search';
$id  = wp_unique_id( 'bl-search-' );
$ph  = trim( (string) ( $attributes['placeholder'] ?? '' ) );
$out = '<form role="search" method="get" action="' . esc_url( home_url( '/' ) ) . '">'
	. '<label for="' . esc_attr( $id ) . '">' . esc_html( $label ) . '</label>'
	. '<div class="bl-search__row"><input type="search" id="' . esc_attr( $id ) . '" name="s"' . ( '' !== $ph ? ' placeholder="' . esc_attr( $ph ) . '"' : '' ) . ' autocomplete="off">'
	. '<button type="submit" class="bl-button">' . esc_html( $btn ) . '</button></div></form>';
printf( '<div %1$s>%2$s</div>', builderlab_wrapper( 'bl-search', $attributes ), $out ); // phpcs:ignore WordPress.Security.EscapeOutput
