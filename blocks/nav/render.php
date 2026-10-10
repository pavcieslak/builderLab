<?php
/** @var array $attributes */
defined( 'ABSPATH' ) || exit;

$label = trim( (string) ( $attributes['label'] ?? '' ) );
$tree  = array();
foreach ( builderlab_lines( $attributes['items'] ?? '' ) as $line ) {
	$child = ( 0 === strpos( $line, '- ' ) );
	$line  = $child ? substr( $line, 2 ) : $line;
	$parts = array_map( 'trim', explode( '|', $line, 2 ) );
	$entry = array( 'label' => $parts[0], 'url' => $parts[1] ?? '', 'children' => array() );
	if ( $child && $tree ) {
		$tree[ count( $tree ) - 1 ]['children'][] = $entry;
	} else {
		$tree[] = $entry;
	}
}
if ( ! $tree ) {
	return;
}
$current = builderlab_current_url();
$link    = function ( $e ) use ( $current ) {
	$url  = esc_url( $e['url'] );
	$here = ( '' !== $url && trailingslashit( $url ) === $current ) ? ' aria-current="page"' : '';
	return '' !== $url
		? '<a href="' . $url . '"' . $here . '>' . esc_html( $e['label'] ) . '</a>'
		: '<span>' . esc_html( $e['label'] ) . '</span>';
};
$uid  = wp_unique_id( 'bl-nav-' );
$html = '<ul class="bl-nav__list">';
foreach ( $tree as $n => $e ) {
	if ( '' === $e['label'] ) {
		continue;
	}
	if ( $e['children'] ) {
		$sub   = $uid . '-' . $n;
		$html .= '<li class="bl-nav__item has-sub">' . $link( $e );
		$html .= '<button type="button" class="bl-nav__toggle" hidden aria-expanded="false" aria-controls="' . esc_attr( $sub ) . '"><span class="bl-sr-only">Show submenu for ' . esc_html( $e['label'] ) . '</span></button>';
		$html .= '<ul class="bl-nav__sub" id="' . esc_attr( $sub ) . '">';
		foreach ( $e['children'] as $c ) {
			if ( '' !== $c['label'] ) {
				$html .= '<li class="bl-nav__item">' . $link( $c ) . '</li>';
			}
		}
		$html .= '</ul></li>';
	} else {
		$html .= '<li class="bl-nav__item">' . $link( $e ) . '</li>';
	}
}
$html .= '</ul>';
$more  = array( 'data-bl-nav' => '' );
if ( '' !== $label ) {
	$more['aria-label'] = $label;
}
printf( '<nav %1$s>%2$s</nav>', builderlab_wrapper( 'bl-nav', $attributes, array(), $more ), $html ); // phpcs:ignore WordPress.Security.EscapeOutput
