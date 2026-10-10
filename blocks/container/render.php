<?php
/** @var array $attributes */
/** @var string $content */
defined( 'ABSPATH' ) || exit;

$allowed = array( 'div', 'section', 'header', 'footer', 'main', 'aside', 'nav', 'article' );
$tag     = in_array( $attributes['tag'] ?? 'div', $allowed, true ) ? $attributes['tag'] : 'div';
$class   = 'bl-container';
$dir = is_array( $attributes['direction'] ?? null ) ? ( $attributes['direction']['desktop'] ?? '' ) : '';
if ( 'row' === ( $attributes['layout'] ?? 'stack' ) || in_array( $dir, array( 'row', 'row-reverse' ), true ) ) {
	$class .= ' is-row';
}
if ( ! empty( $attributes['boxed'] ) ) {
	$class .= ' is-boxed';
}
$more = array();
$label = trim( (string) ( $attributes['label'] ?? '' ) );
if ( '' !== $label ) {
	$more['aria-label'] = $label;
}

// Gap: a token from the spacing scale, or a custom size (px, rem, em, %, vw, vh).
// Row and column gaps can differ. Every container sets all three, so a nested container never inherits a parent's value.
$gap   = builderlab_ds_len( $attributes['gapCustom'] ?? '', '' );
$gap   = '' !== $gap ? $gap : builderlab_space( $attributes['gap'] ?? 3 );
$row   = builderlab_ds_len( $attributes['rowGap'] ?? '', '' );
$col   = builderlab_ds_len( $attributes['columnGap'] ?? '', '' );
$vars  = array(
	'--bl-gap'   => $gap,
	'--bl-gap-r' => '' !== $row ? $row : 'var(--bl-gap)',
	'--bl-gap-c' => '' !== $col ? $col : 'var(--bl-gap)',
);
printf(
	'<%1$s %2$s>%3$s</%1$s>',
	$tag, // phpcs:ignore WordPress.Security.EscapeOutput
	builderlab_wrapper( $class, $attributes, $vars, $more ), // phpcs:ignore WordPress.Security.EscapeOutput
	$content // phpcs:ignore WordPress.Security.EscapeOutput
);
