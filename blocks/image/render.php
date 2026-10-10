<?php
/** @var array $attributes */
defined( 'ABSPATH' ) || exit;

$id      = (int) ( $attributes['id'] ?? 0 );
$url     = esc_url( $attributes['url'] ?? '' );
$caption = builderlab_kses( $attributes['caption'] ?? '' );
$dynamic = false;
if ( 'static' !== ( $attributes['source'] ?? 'static' ) ) {
	// Dynamic source: the picture of the featured image or a custom field. The chosen image above is the fallback.
	$found = builderlab_dynamic_image( $attributes, (int) get_the_ID() );
	if ( $found ) {
		list( $id, $found_url ) = $found;
		$url                    = $found_url ? esc_url( $found_url ) : '';
		$dynamic                = true;
	}
}
// Decorative images, and images with no alt text, are exposed with an empty alt (ignored by screen readers).
// A dynamic picture without an alt text here uses the alt text of the media library item.
// The editor checker flags missing alt text so it is fixed before publishing.
$alt = ! empty( $attributes['decorative'] ) ? '' : trim( (string) ( $attributes['alt'] ?? '' ) );
if ( '' === $alt && $dynamic && $id && empty( $attributes['decorative'] ) ) {
	$alt = trim( (string) get_post_meta( $id, '_wp_attachment_image_alt', true ) );
}

if ( $id && wp_attachment_is_image( $id ) ) {
	$img = wp_get_attachment_image( $id, 'large', false, array( 'alt' => $alt, 'class' => 'bl-image' ) );
} elseif ( '' !== $url ) {
	$img = sprintf( '<img class="bl-image" src="%1$s" alt="%2$s" loading="lazy" decoding="async">', $url, esc_attr( $alt ) );
} else {
	return;
}
if ( '' === $img ) {
	return;
}

if ( '' !== $caption ) {
	printf(
		'<figure %1$s>%2$s<figcaption>%3$s</figcaption></figure>',
		get_block_wrapper_attributes( array( 'class' => 'bl-figure' ) ), // phpcs:ignore WordPress.Security.EscapeOutput
		$img, // phpcs:ignore WordPress.Security.EscapeOutput
		$caption // phpcs:ignore WordPress.Security.EscapeOutput
	);
	return;
}
echo $img; // phpcs:ignore WordPress.Security.EscapeOutput
