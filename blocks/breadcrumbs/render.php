<?php
/** @var array $attributes */
defined( 'ABSPATH' ) || exit;

$post = get_post();
if ( ! $post ) {
	return;
}
$crumbs = array( array( trim( (string) ( $attributes['home'] ?? '' ) ) ?: 'Home', home_url( '/' ) ) );
foreach ( array_reverse( get_post_ancestors( $post ) ) as $ancestor ) {
	$crumbs[] = array( get_the_title( $ancestor ), get_permalink( $ancestor ) );
}
$html = '<ol class="bl-breadcrumbs__list">';
foreach ( $crumbs as $crumb ) {
	$html .= '<li><a href="' . esc_url( $crumb[1] ) . '">' . esc_html( $crumb[0] ) . '</a></li>';
}
$html .= '<li><span aria-current="page">' . esc_html( get_the_title( $post ) ) . '</span></li></ol>';
$name  = trim( (string) ( $attributes['label'] ?? '' ) ) ?: 'Breadcrumb';
printf( '<nav %1$s>%2$s</nav>', builderlab_wrapper( 'bl-breadcrumbs', $attributes, array(), array( 'aria-label' => $name ) ), $html ); // phpcs:ignore WordPress.Security.EscapeOutput
