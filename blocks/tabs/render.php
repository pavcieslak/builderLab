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
$level = max( 2, min( 6, (int) ( $attributes['level'] ?? 3 ) ) );
$uid   = wp_unique_id( 'bl-tabs-' );
$html  = '';
foreach ( $items as $n => $item ) {
	$html .= sprintf(
		'<section class="bl-tabs__panel" id="%1$s"><h%2$d class="bl-tabs__title">%3$s</h%2$d><div class="bl-tabs__body">%4$s</div></section>',
		esc_attr( $uid . '-' . $n ),
		$level,
		esc_html( trim( $item['title'] ) ),
		builderlab_paragraphs( $item['content'] ?? '' ) // phpcs:ignore WordPress.Security.EscapeOutput
	);
}
$more = array( 'data-bl-tabs' => '', 'data-label' => trim( (string) ( $attributes['label'] ?? '' ) ) );
printf( '<div %1$s>%2$s</div>', builderlab_wrapper( 'bl-tabs', $attributes, array(), $more ), $html ); // phpcs:ignore WordPress.Security.EscapeOutput
