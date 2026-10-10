<?php
/** @var array $attributes */
defined( 'ABSPATH' ) || exit;

$items = array();
foreach ( (array) ( $attributes['items'] ?? array() ) as $item ) {
	if ( is_array( $item ) && '' !== trim( (string) ( $item['title'] ?? '' ) ) ) {
		$items[] = $item;
	}
}
if ( ! $items ) {
	return;
}
$group = ! empty( $attributes['exclusive'] ) ? ' name="' . esc_attr( wp_unique_id( 'bl-acc-' ) ) . '"' : '';
$html  = '';
foreach ( $items as $n => $item ) {
	$open  = ( ! empty( $attributes['openFirst'] ) && 0 === $n ) ? ' open' : '';
	$html .= '<details class="bl-accordion__item"' . $group . $open . '><summary class="bl-accordion__title">' . esc_html( trim( $item['title'] ) ) . '</summary><div class="bl-accordion__panel">' . builderlab_paragraphs( $item['content'] ?? '' ) . '</div></details>';
}
printf( '<div %1$s>%2$s</div>', builderlab_wrapper( 'bl-accordion', $attributes ), $html ); // phpcs:ignore WordPress.Security.EscapeOutput
