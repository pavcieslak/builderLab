<?php
/**
 * Per-element layout, for every BuilderLab block, with a value per device:
 * - on any element: width, hide, align self, order, flex size (grow or shrink)
 * - on containers: direction, justify content, align items, wrap
 * Breakpoints (fixed in assets/frontend.css): tablet up to 1024px, mobile up to 767px.
 */
defined( 'ABSPATH' ) || exit;

/** Allowed values and the class code each one gets. */
function builderlab_layout_enums() {
	return array(
		'direction' => array( 'row' => 'row', 'row-reverse' => 'rr', 'column' => 'col', 'column-reverse' => 'cr' ),
		'justify'   => array( 'start' => 'start', 'center' => 'center', 'end' => 'end', 'between' => 'between', 'around' => 'around', 'evenly' => 'evenly' ),
		'align'     => array( 'start' => 'start', 'center' => 'center', 'end' => 'end', 'stretch' => 'stretch' ),
		'wrap'      => array( 'wrap' => 'wrap', 'nowrap' => 'nowrap' ),
		'alignSelf' => array( 'start' => 'start', 'center' => 'center', 'end' => 'end', 'stretch' => 'stretch' ),
		'flexSize'  => array( 'grow' => 'grow', 'shrink' => 'shrink' ),
		'textAlign' => array( 'left' => 'left', 'center' => 'center', 'right' => 'right', 'justify' => 'justify' ),
	);
}

/** Class prefix per setting. */
function builderlab_layout_prefixes() {
	return array( 'direction' => 'bl-d-', 'justify' => 'bl-j-', 'align' => 'bl-a-', 'wrap' => 'bl-wr-', 'alignSelf' => 'bl-as-', 'flexSize' => 'bl-fs-', 'textAlign' => 'bl-ta-' );
}

/** Attributes shared by all BuilderLab blocks, and four more for containers. Each one holds a value per device. */
add_filter( 'register_block_type_args', function ( $args, $name ) {
	if ( 0 !== strpos( $name, 'builderlab/' ) ) {
		return $args;
	}
	$keys = array( 'width', 'hide', 'alignSelf', 'order', 'flexSize', 'padding', 'margin', 'fontSize', 'lineHeight', 'textAlign' );
	if ( 'builderlab/container' === $name ) {
		$keys = array_merge( $keys, array( 'direction', 'justify', 'align', 'wrap' ) );
	}
	foreach ( $keys as $key ) {
		$args['attributes'][ $key ] = array( 'type' => 'object', 'default' => array() );
	}
	$args['attributes']['customCss'] = array( 'type' => 'string', 'default' => '' );
	return $args;
}, 10, 2 );

/** A width: "auto", or a size with a unit. Bare numbers are read as px. Anything else is empty. */
function builderlab_layout_width( $value ) {
	$value = is_scalar( $value ) ? strtolower( trim( (string) $value ) ) : '';
	if ( 'auto' === $value || '' === $value ) {
		return 'auto' === $value ? 'auto' : '';
	}
	$len = builderlab_ds_len( $value, '' );
	if ( '' !== $len && preg_match( '/^\d*\.?\d+(rem|em|px|ch|%|vw|vh)$/', $len ) ) {
		return $len;
	}
	return '';
}

/** One side of padding or margin: a size with a unit. Margins may be negative or "auto"; padding may not. */
function builderlab_spacing_value( $raw, $is_margin ) {
	$raw = is_scalar( $raw ) ? strtolower( trim( (string) $raw ) ) : '';
	if ( '' === $raw ) {
		return '';
	}
	if ( 'auto' === $raw ) {
		return $is_margin ? 'auto' : '';
	}
	$len = builderlab_ds_len( $raw, '' );
	if ( '' === $len || ( ! $is_margin && '-' === substr( $len, 0, 1 ) ) ) {
		return '';
	}
	return $len;
}

/** Cleans one per-device attribute (used when saving from the editor). */
function builderlab_clean_layout_attr( $key, $value ) {
	$out = array();
	if ( ! is_array( $value ) ) {
		return $out;
	}
	$enums = builderlab_layout_enums();
	foreach ( array( 'desktop', 'tablet', 'mobile' ) as $device ) {
		if ( ! isset( $value[ $device ] ) ) {
			continue;
		}
		$v = $value[ $device ];
		if ( 'fontSize' === $key ) {
			$len = builderlab_spacing_value( $v, false );
			if ( '' !== $len && 'auto' !== $len && 0.0 !== (float) $len ) {
				$out[ $device ] = $len;
			}
			continue;
		}
		if ( 'lineHeight' === $key ) {
			$raw = is_scalar( $v ) ? trim( (string) $v ) : '';
			if ( '' !== $raw && is_numeric( $raw ) && $raw >= 0.8 && $raw <= 4 ) {
				$out[ $device ] = (string) ( $raw + 0 );
			} else {
				$len = builderlab_spacing_value( $raw, false );
				if ( '' !== $len && 'auto' !== $len && 0.0 !== (float) $len ) {
					$out[ $device ] = $len;
				}
			}
			continue;
		}
		if ( 'padding' === $key || 'margin' === $key ) {
			if ( ! is_array( $v ) ) {
				continue;
			}
			foreach ( array( 'top', 'right', 'bottom', 'left' ) as $side ) {
				$x = builderlab_spacing_value( $v[ $side ] ?? '', 'margin' === $key );
				if ( '' !== $x ) {
					$out[ $device ][ $side ] = $x;
				}
			}
			continue;
		}
		if ( 'width' === $key ) {
			$w = builderlab_layout_width( $v );
			if ( '' !== $w ) {
				$out[ $device ] = $w;
			}
		} elseif ( 'hide' === $key ) {
			if ( ! empty( $v ) ) {
				$out[ $device ] = true;
			}
		} elseif ( 'order' === $key ) {
			if ( is_numeric( $v ) && (int) $v == $v && abs( (int) $v ) <= 99 ) {
				$out[ $device ] = (int) $v;
			}
		} elseif ( isset( $enums[ $key ] ) ) {
			if ( is_string( $v ) && isset( $enums[ $key ][ $v ] ) ) {
				$out[ $device ] = $v;
			}
		}
	}
	return $out;
}

/** Adds the layout classes and custom properties to the first element of the block output. */
add_filter( 'render_block', function ( $content, $parsed ) {
	$name = $parsed['blockName'] ?? '';
	if ( ! $name || 0 !== strpos( $name, 'builderlab/' ) || '' === trim( $content ) ) {
		return $content;
	}
	$attrs    = $parsed['attrs'] ?? array();
	$suffixes = array( 'desktop' => '', 'tablet' => '-t', 'mobile' => '-m' );
	$classes  = array();
	$vars     = array();

	// Width.
	$width = builderlab_clean_layout_attr( 'width', $attrs['width'] ?? array() );
	foreach ( $suffixes as $device => $suffix ) {
		if ( ! isset( $width[ $device ] ) ) {
			continue;
		}
		$v         = $width[ $device ];
		$vars[]    = '--bl-w' . $suffix . ':' . $v;
		$classes[] = 'bl-w' . $suffix;
		if ( '100%' === $v ) {
			$classes[] = 'bl-wf' . $suffix;
		} elseif ( '%' === substr( $v, -1 ) ) {
			$classes[] = 'bl-wp' . $suffix;
		}
	}

	// Hide on.
	$hide = builderlab_clean_layout_attr( 'hide', $attrs['hide'] ?? array() );
	foreach ( array( 'desktop' => 'd', 'tablet' => 't', 'mobile' => 'm' ) as $device => $c ) {
		if ( ! empty( $hide[ $device ] ) ) {
			$classes[] = 'bl-hide-' . $c;
		}
	}

	// Order.
	$order = builderlab_clean_layout_attr( 'order', $attrs['order'] ?? array() );
	foreach ( $suffixes as $device => $suffix ) {
		if ( isset( $order[ $device ] ) ) {
			$vars[]    = '--bl-o' . $suffix . ':' . (int) $order[ $device ];
			$classes[] = 'bl-o' . $suffix;
		}
	}

	// Font size and line height.
	foreach ( array( 'fontSize' => array( 'bl-fz', '--bl-fz' ), 'lineHeight' => array( 'bl-lh', '--bl-lh' ) ) as $key => $names ) {
		$clean = builderlab_clean_layout_attr( $key, $attrs[ $key ] ?? array() );
		foreach ( $suffixes as $device => $suffix ) {
			if ( isset( $clean[ $device ] ) ) {
				$vars[]    = $names[1] . $suffix . ':' . $clean[ $device ];
				$classes[] = $names[0] . $suffix;
			}
		}
	}

	// Padding and margin, one class per side and device.
	foreach ( array( 'padding' => 'p', 'margin' => 'm' ) as $key => $k ) {
		$spacing = builderlab_clean_layout_attr( $key, $attrs[ $key ] ?? array() );
		foreach ( $suffixes as $device => $suffix ) {
			foreach ( array( 'top' => 't', 'right' => 'r', 'bottom' => 'b', 'left' => 'l' ) as $side => $c ) {
				if ( isset( $spacing[ $device ][ $side ] ) ) {
					$vars[]    = '--bl-' . $k . $c . $suffix . ':' . $spacing[ $device ][ $side ];
					$classes[] = 'bl-' . $k . $c . $suffix;
				}
			}
		}
	}

	// Direction, justify, align, wrap, align self, flex size.
	$enums    = builderlab_layout_enums();
	$prefixes = builderlab_layout_prefixes();
	foreach ( $prefixes as $key => $prefix ) {
		if ( in_array( $key, array( 'direction', 'justify', 'align', 'wrap' ), true ) && 'builderlab/container' !== $name ) {
			continue;
		}
		$clean = builderlab_clean_layout_attr( $key, $attrs[ $key ] ?? array() );
		foreach ( $suffixes as $device => $suffix ) {
			if ( isset( $clean[ $device ] ) ) {
				$classes[] = $prefix . $enums[ $key ][ $clean[ $device ] ] . $suffix;
			}
		}
	}

	if ( ! $classes ) {
		return $content;
	}
	$p = new WP_HTML_Tag_Processor( $content );
	if ( ! $p->next_tag() ) {
		return $content;
	}
	foreach ( array_unique( $classes ) as $class ) {
		$p->add_class( $class );
	}
	if ( $vars ) {
		$style = trim( (string) $p->get_attribute( 'style' ) );
		$p->set_attribute( 'style', ( '' !== $style ? rtrim( $style, ';' ) . ';' : '' ) . implode( ';', $vars ) );
	}
	return $p->get_updated_html();
}, 15, 2 );
