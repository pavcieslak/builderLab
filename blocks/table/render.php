<?php
/** @var array $attributes */
defined( 'ABSPATH' ) || exit;

$rows = array();
foreach ( builderlab_lines( $attributes['data'] ?? '' ) as $line ) {
	$rows[] = array_map( 'trim', explode( '|', $line ) );
}
if ( ! $rows ) {
	return;
}
$header_row  = ! array_key_exists( 'headerRow', $attributes ) || ! empty( $attributes['headerRow'] );
$row_headers = ! empty( $attributes['rowHeaders'] );
$caption     = trim( (string) ( $attributes['caption'] ?? '' ) );
$id          = wp_unique_id( 'bl-table-' );
$cols        = max( array_map( 'count', $rows ) );

$html = '<table class="bl-table__table">';
if ( '' !== $caption ) {
	$html .= '<caption id="' . esc_attr( $id ) . '">' . esc_html( $caption ) . '</caption>';
}
$body_rows = $rows;
if ( $header_row ) {
	$head      = array_shift( $body_rows );
	$html     .= '<thead><tr>';
	for ( $c = 0; $c < $cols; $c++ ) {
		$html .= '<th scope="col">' . builderlab_kses( $head[ $c ] ?? '' ) . '</th>';
	}
	$html .= '</tr></thead>';
}
$html .= '<tbody>';
foreach ( $body_rows as $row ) {
	$html .= '<tr>';
	for ( $c = 0; $c < $cols; $c++ ) {
		$cell = builderlab_kses( $row[ $c ] ?? '' );
		$html .= ( $row_headers && 0 === $c ) ? '<th scope="row">' . $cell . '</th>' : '<td>' . $cell . '</td>';
	}
	$html .= '</tr>';
}
$html .= '</tbody></table>';

// A scrollable region must be reachable by keyboard and have a name.
$more = array( 'role' => 'region', 'tabindex' => '0' );
if ( '' !== $caption ) {
	$more['aria-labelledby'] = $id;
} else {
	$more['aria-label'] = 'Table';
}
printf( '<div %1$s>%2$s</div>', builderlab_wrapper( 'bl-table', $attributes, array(), $more ), $html ); // phpcs:ignore WordPress.Security.EscapeOutput
