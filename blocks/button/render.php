<?php
/** @var array $attributes */
defined( 'ABSPATH' ) || exit;

$label   = trim( wp_strip_all_tags( $attributes['content'] ?? '' ) );
$kind    = ( $attributes['kind'] ?? 'link' ) === 'button' ? 'button' : 'link';
$variants = array( 'outline' => ' is-outline', 'ghost' => ' is-ghost' );
$variant  = $variants[ $attributes['variant'] ?? 'solid' ] ?? '';
$sizes    = array( 'sm' => ' is-sm', 'lg' => ' is-lg' );
$variant .= $sizes[ $attributes['size'] ?? 'md' ] ?? '';
if ( '' === $label ) {
	return;
}
$class = 'bl-button' . $variant;

if ( 'button' === $kind ) {
	// A real button element. It needs behavior from the page (for example a form or a script).
	printf(
		'<button type="button" %1$s>%2$s</button>',
		builderlab_wrapper( $class, $attributes ), // phpcs:ignore WordPress.Security.EscapeOutput
		esc_html( $label )
	);
	return;
}

$url = esc_url( $attributes['url'] ?? '' );
if ( '' === $url ) {
	return; // A link without a destination is not rendered.
}
$more = array( 'href' => $url );
$note = '';
if ( ! empty( $attributes['newTab'] ) ) {
	$more['target'] = '_blank';
	$more['rel']    = 'noopener noreferrer';
	$note           = '<span class="bl-sr-only"> (opens in a new tab)</span>';
}
$attr_html = builderlab_wrapper( $class, $attributes );
$extra     = '';
foreach ( $more as $name => $value ) {
	$extra .= ' ' . esc_attr( $name ) . '="' . esc_attr( $value ) . '"';
}
printf(
	'<a %1$s%2$s>%3$s%4$s</a>',
	$attr_html, // phpcs:ignore WordPress.Security.EscapeOutput
	$extra, // phpcs:ignore WordPress.Security.EscapeOutput
	esc_html( $label ),
	$note // phpcs:ignore WordPress.Security.EscapeOutput
);
