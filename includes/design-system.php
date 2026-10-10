<?php
/**
 * BuilderLab design system: data model, validation, contrast checks, compiler, storage and revisions.
 *
 * Layers: palette (raw colors) -> roles (meaning) -> CSS custom properties -> blocks.
 * Contrast rules only warn. Saving is never blocked by a failing pair.
 */
defined( 'ABSPATH' ) || exit;

const BUILDERLAB_DS_OPTION    = 'builderlab_design_system';
const BUILDERLAB_DS_REVISIONS = 'builderlab_design_system_revisions';
const BUILDERLAB_DS_BUILD     = 'builderlab_design_system_build';
const BUILDERLAB_DS_MAX_REV   = 20;

/** The default design system. Produces the same look the blocks had before design tokens existed. */
function builderlab_ds_defaults() {
	return array(
		'version'    => 1,
		'brand'      => array( 'name' => 'Default' ),
		'palette'    => array(
			'ink'        => '#14181f',
			'slate'      => '#4a5560',
			'gray'       => '#6b7280',
			'surface'    => '#f4f6f8',
			'white'      => '#ffffff',
			'blue'       => '#0a58ca',
			'green'      => '#146c43',
			'amber'      => '#8a4b00',
			'red'        => '#b02a37',
			'blue-tint'  => '#e8f0fe',
			'green-tint' => '#e6f4ea',
			'amber-tint' => '#fff4e5',
			'red-tint'   => '#fdecea',
		),
		'roles'      => array(
			'text'         => 'ink',
			'text-muted'   => 'slate',
			'bg'           => 'white',
			'surface'      => 'surface',
			'border'       => 'gray',
			'input-border' => 'slate',
			'primary'      => 'blue',
			'on-primary'   => 'white',
			'secondary'    => 'slate',
			'on-secondary' => 'white',
			'accent'       => 'green',
			'on-accent'    => 'white',
			'link'         => 'blue',
			'focus'        => 'blue',
			'info'         => 'blue',
			'info-bg'      => 'blue-tint',
			'success'      => 'green',
			'success-bg'   => 'green-tint',
			'warning'      => 'amber',
			'warning-bg'   => 'amber-tint',
			'danger'       => 'red',
			'danger-bg'    => 'red-tint',
		),
		'typography' => array(
			'font-body'           => 'inherit',
			'font-heading'        => 'inherit',
			'font-mono'           => 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
			'sizes'               => array(
				'h1' => '2.25rem', 'h2' => '1.75rem', 'h3' => '1.5rem', 'h4' => '1.25rem', 'h5' => '1.125rem', 'h6' => '1rem',
				'body' => '1rem', 'small' => '0.9375rem', 'lead' => '1.25rem',
			),
			'weight-body'         => 400,
			'weight-strong'       => 600,
			'weight-heading'      => 700,
			'line-height-body'    => 1.6,
			'line-height-heading' => 1.2,
			'measure'             => '70ch',
		),
		'spacing'    => array( '0' => '0rem', '1' => '0.25rem', '2' => '0.5rem', '3' => '1rem', '4' => '1.5rem', '5' => '2rem', '6' => '3rem' ),
		'layout'     => array( 'container' => '70rem', 'gutter' => '1rem' ),
		'shape'      => array( 'radius' => '0.25rem', 'border-thin' => '1px', 'border' => '2px', 'border-thick' => '4px' ),
		'focus'      => array( 'width' => '3px', 'offset' => '2px' ),
		'target'     => array( 'min' => '44px' ),
		'motion'     => array( 'duration' => '150ms', 'easing' => 'ease-out' ),
		'variables'  => array(),
		'components' => builderlab_ds_component_defaults(),
	);
}

/**
 * Component styles. One list drives validation, compiling, the screen and the contrast pairs.
 * Empty length values mean "follow the global tokens". Only values that differ from the default are written to CSS.
 * Types: role (a color role name), length, number, enum (the value is a CSS value).
 */
function builderlab_ds_component_schema() {
	$role = function ( $default, $label ) {
		return array( 'type' => 'role', 'default' => $default, 'label' => $label );
	};
	$len = function ( $label, $help = '' ) {
		return array( 'type' => 'length', 'default' => '', 'label' => $label, 'help' => $help );
	};
	return array(
		'button' => array(
			'label' => 'Button',
			'props' => array(
				'solid-bg'         => $role( 'primary', 'Solid: background' ),
				'solid-fg'         => $role( 'on-primary', 'Solid: text' ),
				'outline-fg'       => $role( 'primary', 'Outline: text and border' ),
				'ghost-fg'         => $role( 'primary', 'Ghost: text' ),
				'radius'           => $len( 'Corner radius', 'Empty follows the global radius.' ),
				'padding-x'        => $len( 'Horizontal padding', 'Default 1.25rem.' ),
				'padding-y'        => $len( 'Vertical padding', 'Default 0.5rem. Keep the height at 44px or more.' ),
				'sm-padding-y'     => $len( 'Small size: vertical padding', 'Default 0.25rem.' ),
				'lg-padding-y'     => $len( 'Large size: vertical padding', 'Default 0.75rem.' ),
				'weight'           => array( 'type' => 'number', 'default' => '', 'label' => 'Font weight', 'min' => 100, 'max' => 900, 'help' => 'Empty follows the strong weight.' ),
				'hover-decoration' => array( 'type' => 'enum', 'default' => 'underline', 'label' => 'On hover', 'options' => array( 'underline', 'none' ) ),
			),
		),
		'alert'  => array(
			'label' => 'Alert',
			'props' => array(
				'radius'         => $len( 'Corner radius', 'Empty follows the global radius.' ),
				'info-border'    => $role( 'info', 'Information: border' ),
				'info-bg'        => $role( 'info-bg', 'Information: background' ),
				'success-border' => $role( 'success', 'Success: border' ),
				'success-bg'     => $role( 'success-bg', 'Success: background' ),
				'warning-border' => $role( 'warning', 'Warning: border' ),
				'warning-bg'     => $role( 'warning-bg', 'Warning: background' ),
				'error-border'   => $role( 'danger', 'Error: border' ),
				'error-bg'       => $role( 'danger-bg', 'Error: background' ),
			),
		),
		'field'  => array(
			'label' => 'Form fields and search',
			'props' => array(
				'border' => $role( 'input-border', 'Field border' ),
				'radius' => $len( 'Corner radius', 'Empty follows the global radius.' ),
				'error'  => $role( 'danger', 'Error text and border' ),
			),
		),
		'table'  => array(
			'label' => 'Table',
			'props' => array(
				'header-bg'    => $role( 'surface', 'Header background' ),
				'border'       => $role( 'border', 'Cell borders' ),
				'cell-padding' => $len( 'Cell padding', 'Default 0.5rem 0.75rem.' ),
			),
		),
		'quote'  => array(
			'label' => 'Quote',
			'props' => array(
				'border' => $role( 'primary', 'Side border' ),
				'size'   => $len( 'Text size', 'Empty follows the lead size.' ),
			),
		),
	);
}

function builderlab_ds_component_defaults() {
	$out = array();
	foreach ( builderlab_ds_component_schema() as $comp => $def ) {
		foreach ( $def['props'] as $prop => $p ) {
			$out[ $comp ][ $prop ] = $p['default'];
		}
	}
	return $out;
}

/** The pairs that are checked for contrast: foreground role, background role, needed ratio, what it is used for. */
function builderlab_ds_pairs() {
	return array_merge( builderlab_ds_role_pairs(), builderlab_ds_component_pairs() );
}

/** Pairs between component properties. Keys look like component.button.solid-fg. */
function builderlab_ds_component_pairs() {
	$c = function ( $comp, $prop ) {
		return 'component.' . $comp . '.' . $prop;
	};
	return array(
		array( $c( 'button', 'solid-fg' ), $c( 'button', 'solid-bg' ), 4.5, 'Text on a solid button' ),
		array( $c( 'button', 'outline-fg' ), 'bg', 4.5, 'Outline button text and border' ),
		array( $c( 'button', 'ghost-fg' ), 'bg', 4.5, 'Ghost button text' ),
		array( 'text', $c( 'alert', 'info-bg' ), 4.5, 'Text in an information alert' ),
		array( 'text', $c( 'alert', 'success-bg' ), 4.5, 'Text in a success alert' ),
		array( 'text', $c( 'alert', 'warning-bg' ), 4.5, 'Text in a warning alert' ),
		array( 'text', $c( 'alert', 'error-bg' ), 4.5, 'Text in an error alert and the form error summary' ),
		array( $c( 'alert', 'info-border' ), 'bg', 3.0, 'Information alert border' ),
		array( $c( 'alert', 'success-border' ), 'bg', 3.0, 'Success alert border' ),
		array( $c( 'alert', 'warning-border' ), 'bg', 3.0, 'Warning alert border' ),
		array( $c( 'alert', 'error-border' ), 'bg', 3.0, 'Error alert border' ),
		array( $c( 'field', 'border' ), 'bg', 3.0, 'Form field border' ),
		array( $c( 'field', 'error' ), 'bg', 4.5, 'Form error messages' ),
		array( 'text', $c( 'table', 'header-bg' ), 4.5, 'Table header text' ),
		array( $c( 'table', 'border' ), 'bg', 3.0, 'Table cell borders' ),
		array( $c( 'quote', 'border' ), 'bg', 3.0, 'Quote side border' ),
	);
}

/** Pairs between roles. */
function builderlab_ds_role_pairs() {
	return array(
		array( 'text', 'bg', 4.5, 'Body text on the page' ),
		array( 'text', 'surface', 4.5, 'Body text on a surface' ),
		array( 'text-muted', 'bg', 4.5, 'Secondary text on the page' ),
		array( 'text-muted', 'surface', 4.5, 'Secondary text on a surface' ),
		array( 'link', 'bg', 4.5, 'Links on the page' ),
		array( 'primary', 'bg', 4.5, 'Outline buttons and primary text on the page' ),
		array( 'on-primary', 'primary', 4.5, 'Text on a primary button' ),
		array( 'on-secondary', 'secondary', 4.5, 'Text on a secondary button' ),
		array( 'on-accent', 'accent', 4.5, 'Text on an accent button' ),
		array( 'focus', 'bg', 3.0, 'Focus ring' ),
		array( 'border', 'bg', 3.0, 'Dividers, table and accordion borders' ),
	);
}

/* ---------- Colors ---------- */

function builderlab_ds_luminance( $hex ) {
	$hex = ltrim( $hex, '#' );
	$rgb = array( hexdec( substr( $hex, 0, 2 ) ), hexdec( substr( $hex, 2, 2 ) ), hexdec( substr( $hex, 4, 2 ) ) );
	foreach ( $rgb as $i => $c ) {
		$c         = $c / 255;
		$rgb[ $i ] = ( $c <= 0.03928 ) ? $c / 12.92 : pow( ( $c + 0.055 ) / 1.055, 2.4 );
	}
	return 0.2126 * $rgb[0] + 0.7152 * $rgb[1] + 0.0722 * $rgb[2];
}

function builderlab_ds_ratio( $a, $b ) {
	$l1 = builderlab_ds_luminance( $a );
	$l2 = builderlab_ds_luminance( $b );
	return ( max( $l1, $l2 ) + 0.05 ) / ( min( $l1, $l2 ) + 0.05 );
}

/** Resolves every role to a #rrggbb value, through the palette. */
function builderlab_ds_resolve_roles( array $ds ) {
	$out = array();
	foreach ( $ds['roles'] as $role => $ref ) {
		$hex = isset( $ds['palette'][ $ref ] ) ? $ds['palette'][ $ref ] : builderlab_hex( $ref );
		if ( '' !== $hex ) {
			$out[ $role ] = $hex;
		}
	}
	return $out;
}

/** Hex value of a pair key: a role name, or component.<component>.<property>. */
function builderlab_ds_pair_color( array $ds, array $roles, $key ) {
	if ( 0 === strpos( $key, 'component.' ) ) {
		list( , $comp, $prop ) = array_pad( explode( '.', $key, 3 ), 3, '' );
		$schema = builderlab_ds_component_schema();
		$role   = $ds['components'][ $comp ][ $prop ] ?? ( $schema[ $comp ]['props'][ $prop ]['default'] ?? '' );
		return $roles[ $role ] ?? '';
	}
	return $roles[ $key ] ?? '';
}

/** Checks every pair. Returns rows with ratio and pass. Never blocks anything. */
function builderlab_ds_contrast( array $ds ) {
	$roles = builderlab_ds_resolve_roles( $ds );
	$rows  = array();
	foreach ( builderlab_ds_pairs() as $pair ) {
		list( $fg, $bg, $need, $use ) = $pair;
		$fg_hex = builderlab_ds_pair_color( $ds, $roles, $fg );
		$bg_hex = builderlab_ds_pair_color( $ds, $roles, $bg );
		if ( '' === $fg_hex || '' === $bg_hex ) {
			continue;
		}
		$ratio  = builderlab_ds_ratio( $fg_hex, $bg_hex );
		$rows[] = array(
			'foreground' => $fg, 'background' => $bg, 'fg' => $fg_hex, 'bg' => $bg_hex,
			'ratio' => round( $ratio, 2 ), 'needed' => $need, 'pass' => $ratio >= $need, 'use' => $use,
		);
	}
	return $rows;
}

/* ---------- Validation ---------- */

/**
 * Reads a size. Accepts "12px", "12 px", "12PX" and a bare number (read as px).
 * Anything else falls back to the default and, when a label is given, adds a warning. Never silent.
 */
function builderlab_ds_len( $value, $fallback, &$warn = null, $label = '' ) {
	$raw = ( is_string( $value ) || is_numeric( $value ) ) ? trim( (string) $value ) : '';
	$v   = strtolower( preg_replace( '/\s+/', '', $raw ) );
	if ( '' === $v ) {
		return $fallback;
	}
	if ( preg_match( '/^-?\d*\.?\d+$/', $v ) && 0.0 !== (float) $v ) {
		if ( null !== $warn && '' !== $label ) {
			$warn[] = sprintf( '%s: "%s" has no unit and was read as %spx.', $label, $raw, $v );
		}
		return $v . 'px';
	}
	if ( preg_match( '/^(0|-?\d*\.?\d+(rem|em|px|ch|%|vw|vh))$/', $v ) ) {
		return $v;
	}
	if ( null !== $warn && '' !== $label ) {
		$warn[] = sprintf( '%s: "%s" is not a valid size. Use a number with a unit, for example 12px or 0.75rem. The default was used.', $label, $raw );
	}
	return $fallback;
}

function builderlab_ds_font( $value, $fallback ) {
	$value = is_string( $value ) ? trim( $value ) : '';
	if ( 'inherit' === $value ) {
		return $value;
	}
	$clean = preg_replace( '/[^A-Za-z0-9 ,\'"\-_]/', '', $value );
	return ( '' !== $clean && strlen( $clean ) <= 200 ) ? $clean : $fallback;
}

function builderlab_ds_number( $value, $min, $max, $fallback, &$warn = null, $label = '' ) {
	if ( is_numeric( $value ) && $value >= $min && $value <= $max ) {
		return $value + 0;
	}
	if ( null !== $warn && '' !== $label && '' !== trim( (string) $value ) ) {
		$warn[] = sprintf( '%s: "%s" is not a number between %s and %s. The default was used.', $label, (string) $value, $min, $max );
	}
	return $fallback;
}

/**
 * Merges input onto the defaults, keeps only valid values and reports problems.
 * Returns array( system, warnings ). Warnings never stop a save.
 */
function builderlab_ds_validate( $input ) {
	$d    = builderlab_ds_defaults();
	$in   = is_array( $input ) ? $input : array();
	$out  = $d;
	$warn = array();

	if ( isset( $in['brand']['name'] ) ) {
		$out['brand']['name'] = sanitize_text_field( (string) $in['brand']['name'] ) ?: $d['brand']['name'];
	}

	if ( isset( $in['palette'] ) && is_array( $in['palette'] ) ) {
		$out['palette'] = array();
		foreach ( $in['palette'] as $name => $value ) {
			$key = sanitize_key( $name );
			$hex = builderlab_hex( $value );
			if ( '' !== $key && '' !== $hex ) {
				$out['palette'][ $key ] = $hex;
			} else {
				$warn[] = sprintf( 'Palette color "%s" is not a valid #rrggbb value and was ignored.', (string) $name );
			}
		}
	}

	$roles = $in['roles'] ?? array();
	foreach ( $d['roles'] as $role => $default_ref ) {
		$ref = isset( $roles[ $role ] ) ? (string) $roles[ $role ] : $default_ref;
		$ok  = isset( $out['palette'][ $ref ] ) || '' !== builderlab_hex( $ref );
		if ( ! $ok ) {
			$warn[] = sprintf( 'Role "%s" points to "%s", which is not a palette color or a #rrggbb value. The default was used.', $role, $ref );
			$ref    = $default_ref;
			if ( ! isset( $out['palette'][ $ref ] ) ) {
				$ref = $d['palette'][ $default_ref ] ?? '#000000';
			}
		}
		$out['roles'][ $role ] = $ref;
	}

	$t  = $in['typography'] ?? array();
	$dt = $d['typography'];
	$out['typography']['font-body']    = builderlab_ds_font( $t['font-body'] ?? $dt['font-body'], $dt['font-body'] );
	$out['typography']['font-heading'] = builderlab_ds_font( $t['font-heading'] ?? $dt['font-heading'], $dt['font-heading'] );
	$out['typography']['font-mono']    = builderlab_ds_font( $t['font-mono'] ?? $dt['font-mono'], $dt['font-mono'] );
	foreach ( $dt['sizes'] as $step => $default ) {
		$out['typography']['sizes'][ $step ] = builderlab_ds_len( $t['sizes'][ $step ] ?? $default, $default, $warn, 'Type size ' . $step );
	}
	$out['typography']['weight-body']         = builderlab_ds_number( $t['weight-body'] ?? $dt['weight-body'], 100, 900, $dt['weight-body'], $warn, 'Body weight' );
	$out['typography']['weight-strong']       = builderlab_ds_number( $t['weight-strong'] ?? $dt['weight-strong'], 100, 900, $dt['weight-strong'], $warn, 'Strong weight' );
	$out['typography']['weight-heading']      = builderlab_ds_number( $t['weight-heading'] ?? $dt['weight-heading'], 100, 900, $dt['weight-heading'], $warn, 'Heading weight' );
	$out['typography']['line-height-body']    = builderlab_ds_number( $t['line-height-body'] ?? $dt['line-height-body'], 1, 3, $dt['line-height-body'], $warn, 'Body line height' );
	$out['typography']['line-height-heading'] = builderlab_ds_number( $t['line-height-heading'] ?? $dt['line-height-heading'], 1, 3, $dt['line-height-heading'], $warn, 'Heading line height' );
	$out['typography']['measure']             = builderlab_ds_len( $t['measure'] ?? $dt['measure'], $dt['measure'], $warn, 'Line length' );

	foreach ( $d['spacing'] as $step => $default ) {
		$out['spacing'][ $step ] = builderlab_ds_len( $in['spacing'][ $step ] ?? $default, $default, $warn, 'Spacing step ' . $step );
	}
	foreach ( array( 'layout', 'shape', 'focus', 'target' ) as $group ) {
		foreach ( $d[ $group ] as $key => $default ) {
			$out[ $group ][ $key ] = builderlab_ds_len( $in[ $group ][ $key ] ?? $default, $default, $warn, ucfirst( $group ) . ' ' . str_replace( '-', ' ', $key ) );
		}
	}
	$dur = isset( $in['motion']['duration'] ) ? (string) $in['motion']['duration'] : $d['motion']['duration'];
	$out['motion']['duration'] = preg_match( '/^\d{1,4}(ms|s)$/', $dur ) ? $dur : $d['motion']['duration'];
	$ease = isset( $in['motion']['easing'] ) ? (string) $in['motion']['easing'] : $d['motion']['easing'];
	$out['motion']['easing'] = in_array( $ease, array( 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear' ), true ) ? $ease : $d['motion']['easing'];

	$out['variables'] = array();
	foreach ( (array) ( $in['variables'] ?? array() ) as $var ) {
		$raw  = isset( $var['name'] ) ? (string) $var['name'] : '';
		$name = ( sanitize_key( $raw ) === $raw ) ? $raw : ''; // A name that needs changing is rejected, not silently altered.
		$type = isset( $var['type'] ) ? (string) $var['type'] : '';
		$val  = isset( $var['value'] ) ? (string) $var['value'] : '';
		if ( ! preg_match( '/^[a-z][a-z0-9-]{0,30}$/', $name ) || ! in_array( $type, array( 'color', 'size', 'font', 'number', 'text' ), true ) ) {
			$warn[] = 'A variable with an invalid name or type was ignored.';
			continue;
		}
		switch ( $type ) {
			case 'color':
				$clean = builderlab_hex( $val );
				break;
			case 'size':
				$clean = builderlab_ds_len( $val, '', $warn, 'Variable "' . $name . '"' );
				break;
			case 'font':
				$clean = builderlab_ds_font( $val, '' );
				break;
			case 'number':
				$clean = is_numeric( $val ) ? (string) ( $val + 0 ) : '';
				break;
			default:
				$clean = preg_replace( '/[^\p{L}\p{N} .,\-_]/u', '', $val );
		}
		if ( '' === $clean ) {
			$warn[] = sprintf( 'Variable "%s" has an invalid %s value and was ignored.', $name, $type );
			continue;
		}
		$out['variables'][] = array( 'name' => $name, 'type' => $type, 'value' => $clean );
	}

	$cin = is_array( $in['components'] ?? null ) ? $in['components'] : array();
	foreach ( builderlab_ds_component_schema() as $comp => $def ) {
		foreach ( $def['props'] as $prop => $p ) {
			$raw = $cin[ $comp ][ $prop ] ?? $p['default'];
			$raw = is_scalar( $raw ) ? (string) $raw : (string) $p['default'];
			switch ( $p['type'] ) {
				case 'role':
					if ( ! isset( $d['roles'][ $raw ] ) ) {
						$warn[] = sprintf( '%s, %s: "%s" is not a color role. The default was used.', $def['label'], $p['label'], $raw );
						$raw    = $p['default'];
					}
					break;
				case 'length':
					$raw = ( '' === $raw ) ? '' : builderlab_ds_len( $raw, '', $warn, $def['label'] . ', ' . $p['label'] );
					break;
				case 'number':
					$raw = ( '' === $raw ) ? '' : (string) builderlab_ds_number( $raw, $p['min'], $p['max'], '', $warn, $def['label'] . ', ' . $p['label'] );
					break;
				case 'enum':
					if ( ! in_array( $raw, $p['options'], true ) ) {
						$warn[] = sprintf( '%s, %s: "%s" is not one of the allowed options. The default was used.', $def['label'], $p['label'], $raw );
						$raw    = $p['default'];
					}
					break;
			}
			$out['components'][ $comp ][ $prop ] = $raw;
		}
	}

	foreach ( builderlab_ds_contrast( $out ) as $row ) {
		if ( ! $row['pass'] ) {
			$warn[] = sprintf( 'Contrast %s:1 is below the %s:1 needed for "%s" on "%s" (%s).', $row['ratio'], $row['needed'], $row['foreground'], $row['background'], $row['use'] );
		}
	}
	return array( $out, $warn );
}

/* ---------- Compile ---------- */

/** Compiles the system to CSS custom properties on :root. */
function builderlab_ds_compile( array $ds ) {
	$v = array();
	foreach ( builderlab_ds_resolve_roles( $ds ) as $role => $hex ) {
		$v[] = '--bl-color-' . $role . ':' . $hex;
	}
	// Short names used by earlier blocks, kept as aliases.
	$v[] = '--bl-ink:var(--bl-color-text)';
	$v[] = '--bl-muted:var(--bl-color-text-muted)';
	$v[] = '--bl-surface:var(--bl-color-surface)';
	$v[] = '--bl-brand:var(--bl-color-primary)';
	$v[] = '--bl-on-brand:var(--bl-color-on-primary)';
	$v[] = '--bl-focus:var(--bl-color-focus)';

	$t   = $ds['typography'];
	$v[] = '--bl-font-body:' . $t['font-body'];
	$v[] = '--bl-font-heading:' . $t['font-heading'];
	$v[] = '--bl-font-mono:' . $t['font-mono'];
	foreach ( $t['sizes'] as $step => $size ) {
		$v[] = '--bl-size-' . $step . ':' . $size;
	}
	$v[] = '--bl-weight-body:' . $t['weight-body'];
	$v[] = '--bl-weight-strong:' . $t['weight-strong'];
	$v[] = '--bl-weight-heading:' . $t['weight-heading'];
	$v[] = '--bl-line-height-body:' . $t['line-height-body'];
	$v[] = '--bl-line-height-heading:' . $t['line-height-heading'];
	$v[] = '--bl-measure:' . $t['measure'];

	foreach ( $ds['spacing'] as $step => $size ) {
		$v[] = '--bl-space-' . $step . ':' . $size;
	}
	$v[] = '--bl-container-width:' . $ds['layout']['container'];
	$v[] = '--bl-gutter:' . $ds['layout']['gutter'];
	$v[] = '--bl-radius:' . $ds['shape']['radius'];
	$v[] = '--bl-border-thin:' . $ds['shape']['border-thin'];
	$v[] = '--bl-border:' . $ds['shape']['border'];
	$v[] = '--bl-border-thick:' . $ds['shape']['border-thick'];
	$v[] = '--bl-focus-width:' . $ds['focus']['width'];
	$v[] = '--bl-focus-offset:' . $ds['focus']['offset'];
	$v[] = '--bl-target-min:' . $ds['target']['min'];
	$v[] = '--bl-duration:' . $ds['motion']['duration'];
	$v[] = '--bl-easing:' . $ds['motion']['easing'];

	foreach ( builderlab_ds_component_schema() as $comp => $def ) {
		foreach ( $def['props'] as $prop => $p ) {
			$val = $ds['components'][ $comp ][ $prop ] ?? $p['default'];
			if ( '' === (string) $val || (string) $val === (string) $p['default'] ) {
				continue;
			}
			$v[] = '--bl-' . $comp . '-' . $prop . ':' . ( 'role' === $p['type'] ? 'var(--bl-color-' . $val . ')' : $val );
		}
	}

	foreach ( $ds['variables'] as $var ) {
		$value = ( 'text' === $var['type'] ) ? '"' . $var['value'] . '"' : $var['value'];
		$v[]   = '--bl-var-' . $var['name'] . ':' . $value;
	}
	return ':root{' . implode( ';', $v ) . '}';
}

/* ---------- Storage, revisions, build ---------- */

function builderlab_ds_get() {
	$stored = get_option( BUILDERLAB_DS_OPTION );
	if ( ! is_array( $stored ) ) {
		return builderlab_ds_defaults();
	}
	list( $ds ) = builderlab_ds_validate( $stored );
	return $ds;
}

function builderlab_ds_revisions() {
	$revs = get_option( BUILDERLAB_DS_REVISIONS, array() );
	return is_array( $revs ) ? $revs : array();
}

/** Writes the compiled file. Returns array( hash, url, bytes ) or an array with an empty url when the folder is not writable. */
function builderlab_ds_build( array $ds = null ) {
	$ds    = $ds ?: builderlab_ds_get();
	$css   = builderlab_ds_compile( $ds );
	$hash  = substr( md5( $css ), 0, 10 );
	$upl   = wp_upload_dir();
	$dir   = trailingslashit( $upl['basedir'] ) . 'builderlab';
	$build = array( 'hash' => $hash, 'url' => '', 'bytes' => strlen( $css ) );
	if ( wp_mkdir_p( $dir ) && false !== @file_put_contents( $dir . '/tokens-' . $hash . '.css', $css ) ) { // phpcs:ignore WordPress.PHP.NoSilencedErrors
		foreach ( (array) glob( $dir . '/tokens-*.css' ) as $old ) {
			if ( basename( $old ) !== 'tokens-' . $hash . '.css' ) {
				@unlink( $old ); // phpcs:ignore WordPress.PHP.NoSilencedErrors
			}
		}
		$build['url'] = trailingslashit( $upl['baseurl'] ) . 'builderlab/tokens-' . $hash . '.css';
	}
	update_option( BUILDERLAB_DS_BUILD, $build, true );
	return $build;
}

/** Saves a system: validates, stores a revision of the previous one, rebuilds the file. */
function builderlab_ds_save( $data, $note = '' ) {
	list( $ds, $warnings ) = builderlab_ds_validate( $data );
	// Keep the previous system as a revision. On the very first save that is the default system.
	$old  = get_option( BUILDERLAB_DS_OPTION );
	$old  = is_array( $old ) ? $old : builderlab_ds_defaults();
	$revs = builderlab_ds_revisions();
	array_unshift( $revs, array( 'time' => time(), 'user' => get_current_user_id(), 'note' => sanitize_text_field( $note ), 'data' => $old ) );
	update_option( BUILDERLAB_DS_REVISIONS, array_slice( $revs, 0, BUILDERLAB_DS_MAX_REV ), false );
	update_option( BUILDERLAB_DS_OPTION, $ds, true );
	$build = builderlab_ds_build( $ds );
	return array( 'system' => $ds, 'warnings' => $warnings, 'build' => $build );
}

/** Registers the tokens stylesheet. Rebuilds the file if it is missing or stale. */
function builderlab_ds_register_style() {
	$ds    = builderlab_ds_get();
	$css   = builderlab_ds_compile( $ds );
	$hash  = substr( md5( $css ), 0, 10 );
	$build = get_option( BUILDERLAB_DS_BUILD );
	$file  = '';
	if ( is_array( $build ) && ! empty( $build['url'] ) ) {
		$upl  = wp_upload_dir();
		$file = trailingslashit( $upl['basedir'] ) . 'builderlab/tokens-' . ( $build['hash'] ?? '' ) . '.css';
	}
	if ( ! is_array( $build ) || ( $build['hash'] ?? '' ) !== $hash || '' === $file || ! file_exists( $file ) ) {
		$build = builderlab_ds_build( $ds );
	}
	if ( ! empty( $build['url'] ) ) {
		wp_register_style( 'builderlab-tokens', $build['url'], array(), null ); // phpcs:ignore WordPress.WP.EnqueuedResourceParameters
	} else {
		wp_register_style( 'builderlab-tokens', false, array(), null );
		wp_add_inline_style( 'builderlab-tokens', $css );
	}
}

/** Palette for the editor: unique colors with names. */
function builderlab_ds_editor_palette() {
	$ds   = builderlab_ds_get();
	$seen = array();
	$out  = array();
	foreach ( $ds['palette'] as $name => $hex ) {
		if ( isset( $seen[ $hex ] ) ) {
			continue;
		}
		$seen[ $hex ] = true;
		$out[]        = array( 'name' => ucwords( str_replace( '-', ' ', $name ) ), 'color' => $hex );
	}
	return $out;
}

/** Spacing token as a CSS value, so blocks follow the design system. */
function builderlab_space( $index ) {
	$index = (int) $index;
	$ds    = builderlab_ds_defaults();
	if ( ! isset( $ds['spacing'][ (string) $index ] ) ) {
		$index = 3;
	}
	return 'var(--bl-space-' . $index . ')';
}
