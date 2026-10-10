<?php
/** @var array $attributes */
defined( 'ABSPATH' ) || exit;

$id   = (int) ( $attributes['templateId'] ?? 0 );
$post = $id ? get_post( $id ) : null;
// Only published components, so a draft or another type cannot be pulled into a page.
if ( ! $post || BUILDERLAB_TEMPLATE_CPT !== $post->post_type || 'publish' !== $post->post_status || 'component' !== builderlab_template_type( $id ) ) {
	return;
}
echo builderlab_render_template( $post ); // phpcs:ignore WordPress.Security.EscapeOutput
