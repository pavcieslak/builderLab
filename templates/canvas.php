<?php
/**
 * BuilderLab canvas: only the page content. No header, no footer, no theme column.
 */
defined( 'ABSPATH' ) || exit;
?><!doctype html>
<html <?php language_attributes(); ?>>
<head>
	<meta charset="<?php bloginfo( 'charset' ); ?>">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<?php wp_head(); ?>
</head>
<body <?php body_class( 'bl-canvas' ); ?>>
<?php wp_body_open(); ?>
<div data-bl-root="1" style="display:contents">
<?php
while ( have_posts() ) {
	the_post();
	the_content();
}
?>
</div>
<?php wp_footer(); ?>
</body>
</html>
