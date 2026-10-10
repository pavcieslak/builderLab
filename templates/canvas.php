<?php
/**
 * BuilderLab canvas: only the page content. No header, no footer, no theme column.
 * The content is rendered first, so the styles of the blocks on the page are known before the head is printed.
 */
defined( 'ABSPATH' ) || exit;

ob_start();
while ( have_posts() ) {
	the_post();
	the_content();
}
$builderlab_content = ob_get_clean();
?><!doctype html>
<html <?php language_attributes(); ?>>
<head>
	<meta charset="<?php bloginfo( 'charset' ); ?>">
	<?php
	// One viewport tag: block themes print their own, classic themes may not.
	ob_start();
	wp_head();
	$builderlab_head = ob_get_clean();
	if ( false === stripos( $builderlab_head, 'name="viewport"' ) && false === stripos( $builderlab_head, "name='viewport'" ) ) {
		echo '<meta name="viewport" content="width=device-width, initial-scale=1">' . "\n";
	}
	echo $builderlab_head; // phpcs:ignore WordPress.Security.EscapeOutput
	?>
</head>
<body <?php body_class( 'bl-canvas' ); ?>>
<?php wp_body_open(); ?>
<div data-bl-root="1" style="display:contents">
<?php echo $builderlab_content; // phpcs:ignore WordPress.Security.EscapeOutput ?>
</div>
<?php wp_footer(); ?>
</body>
</html>
