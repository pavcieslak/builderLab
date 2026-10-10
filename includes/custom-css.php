<?php
/**
 * Custom CSS for one element. The word "this" stands for the element itself:
 *   this { color: red; }   this:hover { color: blue; }   this p { margin: 0; }
 * Plain declarations without braces apply to the element. Every rule is limited to that element.
 */
defined( 'ABSPATH' ) || exit;

/** Rules written for one element, limited to its class. Returns an empty string when nothing safe remains. */
function builderlab_custom_css_scope( $css, $scope ) {
	$css = is_string( $css ) ? substr( $css, 0, 6000 ) : '';
	$css = preg_replace( '#/\*.*?\*/#s', '', $css );
	$css = str_replace( array( '<', "\0", '\\' ), '', (string) $css );
	if ( preg_match( '/@import|@charset|@namespace|expression\s*\(|javascript\s*:|vbscript\s*:|behaviou?r\s*:|-moz-binding/i', $css ) ) {
		return '';
	}
	$css = trim( $css );
	if ( '' === $css ) {
		return '';
	}
	if ( false === strpos( $css, '{' ) ) {
		$css = 'this{' . $css . '}';
	}
	return builderlab_custom_css_rules( $css, $scope );
}

function builderlab_custom_css_rules( $css, $scope ) {
	$out = '';
	$pos = 0;
	$len = strlen( $css );
	while ( $pos < $len ) {
		$open = strpos( $css, '{', $pos );
		if ( false === $open ) {
			break;
		}
		$depth = 1;
		$i     = $open + 1;
		while ( $i < $len && $depth > 0 ) {
			if ( '{' === $css[ $i ] ) {
				++$depth;
			} elseif ( '}' === $css[ $i ] ) {
				--$depth;
			}
			++$i;
		}
		$selector = trim( substr( $css, $pos, $open - $pos ) );
		$body     = substr( $css, $open + 1, max( 0, $i - $open - 2 ) );
		$pos      = $i;
		if ( '' === $selector ) {
			continue;
		}
		if ( '@' === $selector[0] ) {
			if ( preg_match( '/^@(media|supports|container)\b/i', $selector ) ) {
				$inner = builderlab_custom_css_rules( $body, $scope );
				$out  .= '' !== $inner ? $selector . '{' . $inner . '}' : '';
			} elseif ( preg_match( '/^@(-webkit-)?keyframes\b/i', $selector ) ) {
				$out .= $selector . '{' . $body . '}';
			}
			continue;
		}
		$parts = array();
		foreach ( explode( ',', $selector ) as $one ) {
			$one = trim( $one );
			if ( '' === $one ) {
				continue;
			}
			$self    = preg_match( '/(?<![\w.#-])this(?![\w-])/', $one );
			$parts[] = $self ? preg_replace( '/(?<![\w.#-])this(?![\w-])/', $scope, $one ) : $scope . ' ' . $one;
		}
		$decls = array();
		foreach ( explode( ';', $body ) as $decl ) {
			$decl = trim( $decl );
			if ( '' === $decl || false !== strpos( $decl, '{' ) || false !== strpos( $decl, '}' ) ) {
				continue;
			}
			if ( false !== stripos( $decl, 'url(' ) && ! preg_match( '/url\(\s*["\']?(https?:|\/|\.|#|data:image\/)/i', $decl ) ) {
				continue;
			}
			$decls[] = $decl;
		}
		if ( $parts && $decls ) {
			$out .= implode( ',', $parts ) . '{' . implode( ';', $decls ) . '}';
		}
	}
	return $out;
}

/** Adds a class to elements that have custom CSS, and keeps the rules to print once. */
add_filter( 'render_block', function ( $content, $parsed ) {
	$name = $parsed['blockName'] ?? '';
	if ( ! $name || 0 !== strpos( $name, 'builderlab/' ) || '' === trim( $content ) ) {
		return $content;
	}
	$css = $parsed['attrs']['customCss'] ?? '';
	if ( ! is_string( $css ) || '' === trim( $css ) ) {
		return $content;
	}
	$hash  = substr( md5( $css ), 0, 8 );
	$class = 'bl-c-' . $hash;
	$rules = builderlab_custom_css_scope( $css, '.' . $class . '.' . $class );
	if ( '' === $rules ) {
		return $content;
	}
	$GLOBALS['builderlab_custom_css'][ $hash ] = $rules;
	$p = new WP_HTML_Tag_Processor( $content );
	if ( $p->next_tag() ) {
		$p->add_class( $class );
		return $p->get_updated_html();
	}
	return $content;
}, 16, 2 );

/** The collected rules as one style element, then forgotten. */
function builderlab_custom_css_flush() {
	$rules = $GLOBALS['builderlab_custom_css'] ?? array();
	$GLOBALS['builderlab_custom_css'] = array();
	return $rules ? '<style id="bl-custom-css">' . implode( '', $rules ) . '</style>' : '';
}

add_action( 'wp_footer', function () {
	echo builderlab_custom_css_flush(); // phpcs:ignore WordPress.Security.EscapeOutput
}, 5 );
