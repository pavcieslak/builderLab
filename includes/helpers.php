<?php
defined( 'ABSPATH' ) || exit;

/** Inline HTML allowed inside text blocks. Everything else is stripped. */
function builderlab_kses( $html ) {
	$allowed = array(
		'a'      => array( 'href' => true, 'rel' => true, 'target' => true ),
		'abbr'   => array( 'title' => true ),
		'b'      => array(),
		'br'     => array(),
		'cite'   => array(),
		'code'   => array(),
		'em'     => array(),
		'i'      => array(),
		'kbd'    => array(),
		'mark'   => array(),
		'q'      => array(),
		'small'  => array(),
		'strong' => array(),
		'sub'    => array(),
		'sup'    => array(),
	);
	return wp_kses( (string) $html, $allowed );
}

/** Returns a safe #rrggbb value or an empty string. */
function builderlab_hex( $value ) {
	$value = is_string( $value ) ? trim( $value ) : '';
	return preg_match( '/^#[0-9a-fA-F]{6}$/', $value ) ? strtolower( $value ) : '';
}

/** A block color: a #rrggbb value, or the name of a design system role (shown as a CSS variable). */
function builderlab_color_value( $value ) {
	$value = is_string( $value ) ? trim( $value ) : '';
	$hex   = builderlab_hex( $value );
	if ( '' !== $hex ) {
		return $hex;
	}
	$roles = builderlab_ds_defaults()['roles'];
	return isset( $roles[ $value ] ) ? 'var(--bl-color-' . $value . ')' : '';
}

/** Builds the inline custom-property style for colors and gap. */
function builderlab_style( array $attributes, array $extra = array() ) {
	$vars = array();
	$fg   = builderlab_color_value( $attributes['fg'] ?? '' );
	$bg   = builderlab_color_value( $attributes['bg'] ?? '' );
	if ( $fg ) {
		$vars[] = '--bl-fg:' . $fg;
	}
	if ( $bg ) {
		$vars[] = '--bl-bg:' . $bg;
	}
	foreach ( $extra as $name => $value ) {
		$vars[] = $name . ':' . $value;
	}
	return implode( ';', $vars );
}

/** Wrapper attributes: one class, optional inline custom properties. */
function builderlab_wrapper( $class, array $attributes, array $extra_vars = array(), array $more = array() ) {
	$args  = array( 'class' => $class ) + $more;
	$style = builderlab_style( $attributes, $extra_vars );
	if ( '' !== $style ) {
		$args['style'] = $style;
	}
	return get_block_wrapper_attributes( $args );
}

/** Non-empty trimmed lines of a text value. */
function builderlab_lines( $text ) {
	$lines = preg_split( '/\R/', (string) $text );
	return array_values( array_filter( array_map( 'trim', $lines ), 'strlen' ) );
}

/** Text with blank lines between paragraphs, as safe <p> markup. */
function builderlab_paragraphs( $text ) {
	$parts = preg_split( '/\R{2,}/', trim( (string) $text ) );
	$out   = '';
	foreach ( $parts as $part ) {
		$part = trim( $part );
		if ( '' !== $part ) {
			$out .= '<p>' . builderlab_kses( nl2br( $part ) ) . '</p>';
		}
	}
	return $out;
}

/** Allowlist for the HTML block: structure, tables, forms. No script, iframe, object or style. */
function builderlab_allowed_html() {
	$tags = wp_kses_allowed_html( 'post' );
	$attr = array(
		'class' => true, 'id' => true, 'title' => true, 'role' => true, 'lang' => true, 'dir' => true, 'hidden' => true,
		'for' => true, 'name' => true, 'type' => true, 'value' => true, 'placeholder' => true, 'required' => true,
		'checked' => true, 'selected' => true, 'disabled' => true, 'readonly' => true, 'action' => true, 'method' => true,
		'autocomplete' => true, 'rows' => true, 'cols' => true, 'min' => true, 'max' => true, 'step' => true,
		'pattern' => true, 'maxlength' => true, 'multiple' => true, 'open' => true, 'datetime' => true,
		'aria-label' => true, 'aria-labelledby' => true, 'aria-describedby' => true, 'aria-hidden' => true,
		'aria-live' => true, 'aria-expanded' => true, 'aria-controls' => true, 'aria-current' => true,
		'aria-required' => true, 'aria-invalid' => true,
	);
	foreach ( array( 'form', 'input', 'select', 'option', 'optgroup', 'textarea', 'label', 'fieldset', 'legend', 'button', 'details', 'summary', 'dl', 'dt', 'dd', 'time', 'mark', 'kbd', 'samp', 'var', 'abbr', 'cite', 'q', 'small', 'sub', 'sup', 'dfn', 'figure', 'figcaption', 'hr', 'nav', 'section', 'article', 'aside', 'header', 'footer', 'main', 'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col', 'ul', 'ol', 'li', 'p', 'div', 'span', 'a', 'img', 'blockquote', 'pre', 'code', 'strong', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6' ) as $tag ) {
		$tags[ $tag ] = array_merge( isset( $tags[ $tag ] ) ? (array) $tags[ $tag ] : array(), $attr );
	}
	$tags['a']     = array_merge( $tags['a'], array( 'href' => true, 'rel' => true, 'target' => true ) );
	$tags['img']   = array_merge( $tags['img'], array( 'src' => true, 'alt' => true, 'width' => true, 'height' => true, 'loading' => true ) );
	$tags['th']    = array_merge( $tags['th'], array( 'scope' => true, 'colspan' => true, 'rowspan' => true ) );
	$tags['td']    = array_merge( $tags['td'], array( 'colspan' => true, 'rowspan' => true ) );
	$tags['label'] = array_merge( $tags['label'], array( 'for' => true ) );
	unset( $tags['script'], $tags['style'], $tags['iframe'], $tags['object'], $tags['embed'] );
	return $tags;
}

/** Alert type words, visible so that meaning never relies on color alone. */
function builderlab_alert_words() {
	return array(
		'info'    => 'Information',
		'success' => 'Success',
		'warning' => 'Warning',
		'error'   => 'Error',
	);
}

/** Current page URL without query string, for aria-current matching. */
function builderlab_current_url() {
	global $wp;
	return isset( $wp ) ? trailingslashit( home_url( $wp->request ) ) : '';
}

/**
 * Dynamic images. The picture can come from the featured image, a custom field (ACF or plain post meta) or an ACF options field.
 * ACF image fields may return an ID, a URL or an array; all three are understood. Returns array( id, url ) or null.
 */
function builderlab_image_from_value( $value ) {
	if ( is_array( $value ) ) {
		$value = $value['ID'] ?? ( $value['id'] ?? ( $value['url'] ?? '' ) );
	}
	if ( is_numeric( $value ) && (int) $value > 0 ) {
		$id = (int) $value;
		return wp_attachment_is_image( $id ) ? array( $id, '' ) : null;
	}
	if ( is_string( $value ) && preg_match( '#^https?://#i', $value ) ) {
		$id = attachment_url_to_postid( $value );
		return $id ? array( $id, '' ) : array( 0, esc_url_raw( $value ) );
	}
	return null;
}

/** A field name, never a protected one (starting with an underscore). */
function builderlab_custom_field_name( $name ) {
	$name = is_string( $name ) ? trim( $name ) : '';
	return preg_match( '/^[A-Za-z][A-Za-z0-9_\-]{0,79}$/', $name ) ? $name : '';
}

function builderlab_dynamic_image( array $attrs, $post_id ) {
	$source = $attrs['source'] ?? 'static';
	$key    = builderlab_custom_field_name( $attrs['field'] ?? '' );
	$value  = null;
	if ( 'featured' === $source && $post_id ) {
		$value = get_post_thumbnail_id( $post_id );
	} elseif ( 'field' === $source && '' !== $key && $post_id ) {
		$value = function_exists( 'get_field' ) ? get_field( $key, $post_id ) : null;
		if ( empty( $value ) ) {
			$value = get_post_meta( $post_id, $key, true );
		}
	} elseif ( 'option' === $source && '' !== $key ) {
		$value = function_exists( 'get_field' ) ? get_field( $key, 'option' ) : null;
		if ( empty( $value ) ) {
			$value = get_option( 'options_' . $key );
		}
	}
	return builderlab_image_from_value( $value );
}
