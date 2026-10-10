/* BuilderLab design system screen.
 * Spike shortcut: no build step, React through wp.element. */
( function ( wp ) {
	'use strict';

	const { createElement: h, useState, useEffect, useRef, useMemo, Fragment } = wp.element;
	const apiFetch = wp.apiFetch;
	const cfg = window.builderlabDS || {};
	const API = '/builderlab/v1/design-system';

	/* ---------- helpers ---------- */

	const HEX = /^#[0-9a-fA-F]{6}$/;
	const LEN = /^(0|-?\d*\.?\d+(rem|em|px|ch|%|vw|vh))$/;
	const isHex = ( v ) => HEX.test( v || '' );
	/** Same reading as the server: "12", "12 px" and "12PX" become 12px. Returns '' when it cannot be read. */
	function normLen( value ) {
		const v = String( value === undefined || value === null ? '' : value ).replace( /\s+/g, '' ).toLowerCase();
		if ( v === '' ) {
			return '';
		}
		if ( /^-?\d*\.?\d+$/.test( v ) && parseFloat( v ) !== 0 ) {
			return v + 'px';
		}
		return LEN.test( v ) ? v : '';
	}
	/** 'ok' | 'bare' (will be read as px) | 'bad' | 'empty' */
	function lengthState( value ) {
		const raw = String( value === undefined || value === null ? '' : value ).trim();
		if ( raw === '' ) {
			return 'empty';
		}
		if ( ! normLen( raw ) ) {
			return 'bad';
		}
		return /^-?\d*\.?\d+$/.test( raw.replace( /\s+/g, '' ) ) && parseFloat( raw ) !== 0 ? 'bare' : 'ok';
	}
	function leaves( obj, path, out ) {
		if ( obj !== null && typeof obj === 'object' ) {
			Object.keys( obj ).forEach( ( k ) => leaves( obj[ k ], path.concat( [ k ] ), out ) );
		} else {
			out[ path.join( '.' ) ] = obj;
		}
		return out;
	}

	function setIn( obj, path, value ) {
		const copy = Array.isArray( obj ) ? obj.slice() : Object.assign( {}, obj );
		const [ head, ...rest ] = path;
		copy[ head ] = rest.length ? setIn( obj[ head ] === undefined ? {} : obj[ head ], rest, value ) : value;
		return copy;
	}
	function lum( hex ) {
		const n = parseInt( hex.slice( 1 ), 16 );
		return [ ( n >> 16 ) & 255, ( n >> 8 ) & 255, n & 255 ]
			.map( ( c ) => {
				c /= 255;
				return c <= 0.03928 ? c / 12.92 : Math.pow( ( c + 0.055 ) / 1.055, 2.4 );
			} )
			.reduce( ( a, c, i ) => a + c * [ 0.2126, 0.7152, 0.0722 ][ i ], 0 );
	}
	function ratio( a, b ) {
		const l1 = lum( a );
		const l2 = lum( b );
		return ( Math.max( l1, l2 ) + 0.05 ) / ( Math.min( l1, l2 ) + 0.05 );
	}
	function resolveRoles( sys ) {
		const out = {};
		Object.keys( sys.roles || {} ).forEach( ( role ) => {
			const ref = sys.roles[ role ];
			const hex = ( sys.palette || {} )[ ref ] || ( isHex( ref ) ? ref : '' );
			if ( isHex( hex ) ) {
				out[ role ] = hex.toLowerCase();
			}
		} );
		return out;
	}
	/** Hex of a pair key: a role name, or component.<component>.<property>. */
	function pairColor( sys, roles, schema, key ) {
		if ( key.indexOf( 'component.' ) === 0 ) {
			const parts = key.split( '.' );
			const comp = parts[ 1 ];
			const prop = parts.slice( 2 ).join( '.' );
			const def = ( ( schema[ comp ] || {} ).props || {} )[ prop ] || {};
			const role = ( ( sys.components || {} )[ comp ] || {} )[ prop ] || def.default;
			return roles[ role ] || '';
		}
		return roles[ key ] || '';
	}
	function contrastRows( sys, pairs, schema ) {
		const roles = resolveRoles( sys );
		const rows = [];
		( pairs || [] ).forEach( ( p ) => {
			const fgHex = pairColor( sys, roles, schema || {}, p[ 0 ] );
			const bgHex = pairColor( sys, roles, schema || {}, p[ 1 ] );
			if ( ! fgHex || ! bgHex ) {
				return;
			}
			const r = ratio( fgHex, bgHex );
			rows.push( { fg: p[ 0 ].replace( /^component\./, '' ), bg: p[ 1 ].replace( /^component\./, '' ), fgHex, bgHex, needed: p[ 2 ], use: p[ 3 ], ratio: Math.round( r * 100 ) / 100, pass: r >= p[ 2 ] } );
		} );
		return rows;
	}
	/** Same variables the PHP compiler writes, for the live preview. Invalid values are skipped. */
	function compileVars( sys, schema ) {
		const v = {};
		const roles = resolveRoles( sys );
		Object.keys( roles ).forEach( ( r ) => ( v[ '--bl-color-' + r ] = roles[ r ] ) );
		const t = sys.typography || {};
		[ 'font-body', 'font-heading', 'font-mono' ].forEach( ( k ) => t[ k ] && ( v[ '--bl-' + k ] = t[ k ] ) );
		Object.keys( t.sizes || {} ).forEach( ( k ) => normLen( t.sizes[ k ] ) && ( v[ '--bl-size-' + k ] = normLen( t.sizes[ k ] ) ) );
		[ 'weight-body', 'weight-strong', 'weight-heading', 'line-height-body', 'line-height-heading' ].forEach( ( k ) => {
			if ( t[ k ] !== undefined && t[ k ] !== '' && ! isNaN( t[ k ] ) ) {
				v[ '--bl-' + k ] = String( t[ k ] );
			}
		} );
		normLen( t.measure ) && ( v[ '--bl-measure' ] = normLen( t.measure ) );
		Object.keys( sys.spacing || {} ).forEach( ( k ) => normLen( sys.spacing[ k ] ) && ( v[ '--bl-space-' + k ] = normLen( sys.spacing[ k ] ) ) );
		const map = [ [ 'layout', 'container', 'container-width' ], [ 'layout', 'gutter', 'gutter' ], [ 'shape', 'radius', 'radius' ], [ 'shape', 'border-thin', 'border-thin' ],
			[ 'shape', 'border', 'border' ], [ 'shape', 'border-thick', 'border-thick' ], [ 'focus', 'width', 'focus-width' ], [ 'focus', 'offset', 'focus-offset' ], [ 'target', 'min', 'target-min' ] ];
		map.forEach( ( m ) => sys[ m[ 0 ] ] && normLen( sys[ m[ 0 ] ][ m[ 1 ] ] ) && ( v[ '--bl-' + m[ 2 ] ] = normLen( sys[ m[ 0 ] ][ m[ 1 ] ] ) ) );
		sys.motion && sys.motion.duration && ( v[ '--bl-duration' ] = sys.motion.duration );
		sys.motion && sys.motion.easing && ( v[ '--bl-easing' ] = sys.motion.easing );
		( sys.variables || [] ).forEach( ( x ) => x.name && x.value && ( v[ '--bl-var-' + x.name ] = x.type === 'text' ? '"' + x.value + '"' : x.value ) );
		// Component properties: only values that differ from the default are written, as in the PHP compiler.
		Object.keys( schema || {} ).forEach( ( comp ) => {
			const props = schema[ comp ].props || {};
			Object.keys( props ).forEach( ( prop ) => {
				const p = props[ prop ];
				const val = ( ( sys.components || {} )[ comp ] || {} )[ prop ];
				if ( val === undefined || val === '' || String( val ) === String( p.default ) ) {
					return;
				}
				if ( p.type === 'role' ) {
					roles[ val ] && ( v[ '--bl-' + comp + '-' + prop ] = 'var(--bl-color-' + val + ')' );
				} else if ( p.type === 'length' ) {
					normLen( val ) && ( v[ '--bl-' + comp + '-' + prop ] = normLen( val ) );
				} else if ( p.type === 'number' ) {
					! isNaN( val ) && ( v[ '--bl-' + comp + '-' + prop ] = String( val ) );
				} else if ( p.type === 'enum' && ( p.options || [] ).indexOf( val ) !== -1 ) {
					v[ '--bl-' + comp + '-' + prop ] = val;
				}
			} );
		} );
		return v;
	}

	/* ---------- small components ---------- */

	let uid = 0;
	const useId = () => useMemo( () => 'bl-ds-' + ++uid, [] );

	function Field( { label, value, onChange, type, help, wide, length } ) {
		const id = useId();
		const state = length ? lengthState( value ) : 'empty';
		const hint =
			state === 'bad'
				? 'This is not a size the system can read. Use a number with a unit, for example 12px or 0.75rem.'
				: state === 'bare'
				? 'No unit given. This will be read as ' + normLen( value ) + '.'
				: '';
		const describedBy = [ help ? id + '-help' : '', hint ? id + '-hint' : '' ].filter( Boolean ).join( ' ' ) || undefined;
		return h(
			'div',
			{ className: 'bl-ds-field' + ( wide ? ' is-wide' : '' ) },
			h( 'label', { htmlFor: id }, label ),
			h( 'input', { id, type: type || 'text', value: value === undefined || value === null ? '' : value, onChange: ( e ) => onChange( e.target.value ), 'aria-describedby': describedBy, 'aria-invalid': state === 'bad' ? 'true' : undefined } ),
			help && h( 'p', { id: id + '-help', className: 'bl-desc' }, help ),
			hint && h( 'p', { id: id + '-hint', className: 'bl-ds-hint ' + ( state === 'bad' ? 'is-bad' : 'is-note' ) }, hint )
		);
	}
	function Group( { title, children } ) {
		return h( 'fieldset', { className: 'bl-ds-group' }, h( 'legend', null, title ), children );
	}
	function Badge( { row } ) {
		return h( 'span', { className: 'bl-ds-badge ' + ( row.pass ? 'is-pass' : 'is-fail' ) }, `${ row.ratio }:1 ${ row.pass ? 'passes' : 'fails' } AA (needs ${ row.needed }:1)` );
	}

	/* ---------- sections ---------- */

	function ColorsSection( { sys, setSys, meta, rows } ) {
		const [ newName, setNewName ] = useState( '' );
		const used = {};
		Object.keys( sys.roles ).forEach( ( r ) => ( used[ sys.roles[ r ] ] = true ) );
		const palette = sys.palette;
		return h(
			Fragment,
			null,
			h(
				Group,
				{ title: 'Palette (raw colors)' },
				h( 'p', { className: 'bl-desc' }, 'Name your brand colors here. Roles below decide what each color is used for.' ),
				h(
					'ul',
					{ className: 'bl-ds-palette' },
					Object.keys( palette ).map( ( name ) =>
						h(
							'li',
							{ key: name },
							h( 'span', { className: 'bl-ds-palette__name' }, name ),
							h( 'input', { type: 'color', 'aria-label': name + ' color picker', value: isHex( palette[ name ] ) ? palette[ name ] : '#000000', onChange: ( e ) => setSys( setIn( sys, [ 'palette', name ], e.target.value ) ) } ),
							h( 'input', { type: 'text', 'aria-label': name + ' hex value', className: 'bl-ds-hex', value: palette[ name ], onChange: ( e ) => setSys( setIn( sys, [ 'palette', name ], e.target.value ) ) } ),
							h( 'button', { type: 'button', className: 'blb', disabled: !! used[ name ], title: used[ name ] ? 'In use by a role' : '', onClick: () => { const p = Object.assign( {}, palette ); delete p[ name ]; setSys( setIn( sys, [ 'palette' ], p ) ); } }, 'Remove ' + name )
						)
					)
				),
				h(
					'div',
					{ className: 'bl-ds-add' },
					h( Field, { label: 'New color name', value: newName, onChange: setNewName, help: 'Lowercase letters, numbers and hyphens.' } ),
					h( 'button', { type: 'button', className: 'blb', disabled: ! /^[a-z0-9-]+$/.test( newName ) || palette[ newName ], onClick: () => { setSys( setIn( sys, [ 'palette', newName ], '#808080' ) ); setNewName( '' ); } }, 'Add color' )
				)
			),
			h(
				Group,
				{ title: 'Roles (what each color is for)' },
				Object.keys( sys.roles ).map( ( role ) => {
					const help = ( meta.roleHelp || {} )[ role ] || [ role, '' ];
					const ref = sys.roles[ role ];
					const related = rows.filter( ( r ) => r.fg === role || r.bg === role );
					return h(
						'div',
						{ key: role, className: 'bl-ds-role' },
						h( RoleSelect, { role, help, value: ref, palette, onChange: ( v ) => setSys( setIn( sys, [ 'roles', role ], v ) ) } ),
						related.length > 0 &&
							h(
								'ul',
								{ className: 'bl-ds-pairs' },
								related.map( ( r, i ) =>
									h( 'li', { key: i }, h( 'span', null, `${ r.fg } on ${ r.bg }: ` ), h( Badge, { row: r } ) )
								)
							)
					);
				} )
			)
		);
	}
	function RoleSelect( { role, help, value, palette, onChange } ) {
		const id = useId();
		const names = Object.keys( palette );
		const custom = ! palette[ value ];
		return h(
			'div',
			{ className: 'bl-ds-field' },
			h( 'label', { htmlFor: id }, help[ 0 ], h( 'span', { className: 'bl-ds-role__code' }, ' (' + role + ')' ) ),
			h(
				'select',
				{ id, value, onChange: ( e ) => onChange( e.target.value ), 'aria-describedby': id + '-help' },
				custom && h( 'option', { value }, 'Custom ' + value ),
				names.map( ( n ) => h( 'option', { key: n, value: n }, n + ' ' + palette[ n ] ) )
			),
			h( 'p', { id: id + '-help', className: 'bl-desc' }, help[ 1 ] )
		);
	}

	function TypographySection( { sys, setSys } ) {
		const t = sys.typography;
		const set = ( k ) => ( v ) => setSys( setIn( sys, [ 'typography', k ], v ) );
		return h(
			Fragment,
			null,
			h( Group, { title: 'Fonts' },
				h( Field, { label: 'Body font', value: t[ 'font-body' ], onChange: set( 'font-body' ), help: 'Use "inherit" to follow the theme, or a font stack such as system-ui, sans-serif.' } ),
				h( Field, { label: 'Heading font', value: t[ 'font-heading' ], onChange: set( 'font-heading' ) } ),
				h( Field, { label: 'Code font', value: t[ 'font-mono' ], onChange: set( 'font-mono' ) } ) ),
			h( Group, { title: 'Sizes' },
				Object.keys( t.sizes ).map( ( k ) => h( Field, { key: k, length: true, label: k, value: t.sizes[ k ], onChange: ( v ) => setSys( setIn( sys, [ 'typography', 'sizes', k ], v ) ), help: k === 'body' ? 'Keep body text at 1rem (16 px) or larger.' : undefined } ) ) ),
			h( Group, { title: 'Weights and line heights' },
				h( Field, { label: 'Body weight', value: t[ 'weight-body' ], onChange: set( 'weight-body' ), type: 'number' } ),
				h( Field, { label: 'Strong weight', value: t[ 'weight-strong' ], onChange: set( 'weight-strong' ), type: 'number' } ),
				h( Field, { label: 'Heading weight', value: t[ 'weight-heading' ], onChange: set( 'weight-heading' ), type: 'number' } ),
				h( Field, { label: 'Body line height', value: t[ 'line-height-body' ], onChange: set( 'line-height-body' ), type: 'number', help: 'At least 1.5 is recommended for body text.' } ),
				h( Field, { label: 'Heading line height', value: t[ 'line-height-heading' ], onChange: set( 'line-height-heading' ), type: 'number' } ),
				h( Field, { length: true, label: 'Line length (measure)', value: t.measure, onChange: set( 'measure' ), help: 'About 70ch keeps lines easy to read.' } ) )
		);
	}

	function SpacingSection( { sys, setSys } ) {
		return h(
			Fragment,
			null,
			h( Group, { title: 'Spacing scale' }, Object.keys( sys.spacing ).map( ( k ) => h( Field, { key: k, length: true, label: 'Step ' + k, value: sys.spacing[ k ], onChange: ( v ) => setSys( setIn( sys, [ 'spacing', k ], v ) ) } ) ) ),
			h( Group, { title: 'Layout' },
				h( Field, { length: true, label: 'Container width', value: sys.layout.container, onChange: ( v ) => setSys( setIn( sys, [ 'layout', 'container' ], v ) ) } ),
				h( Field, { length: true, label: 'Side gutter', value: sys.layout.gutter, onChange: ( v ) => setSys( setIn( sys, [ 'layout', 'gutter' ], v ) ) } ) )
		);
	}

	function ShapeSection( { sys, setSys } ) {
		const f = ( g, k, label, help ) => h( Field, { length: true, label, help, value: sys[ g ][ k ], onChange: ( v ) => setSys( setIn( sys, [ g, k ], v ) ) } );
		return h(
			Fragment,
			null,
			h( Group, { title: 'Shape' }, f( 'shape', 'radius', 'Corner radius' ), f( 'shape', 'border-thin', 'Thin border' ), f( 'shape', 'border', 'Border' ), f( 'shape', 'border-thick', 'Thick border' ) ),
			h( Group, { title: 'Focus ring' }, f( 'focus', 'width', 'Ring width', 'At least 2px is recommended.' ), f( 'focus', 'offset', 'Ring offset' ) ),
			h( Group, { title: 'Target size' }, f( 'target', 'min', 'Minimum size of buttons and controls', '44px is recommended. WCAG 2.2 level AA needs at least 24px.' ) )
		);
	}

	function ComponentsSection( { sys, setSys, meta, rows } ) {
		const schema = meta.schema || {};
		const roles = Object.keys( sys.roles || {} );
		return h(
			Fragment,
			null,
			h( 'p', { className: 'bl-desc' }, 'Style each block type once. Colors are roles from your palette, so a rebrand reaches every block. Empty size fields follow the global tokens.' ),
			Object.keys( schema ).map( ( comp ) => {
				const props = schema[ comp ].props;
				const values = ( sys.components || {} )[ comp ] || {};
				const related = rows.filter( ( r ) => r.fg.indexOf( comp + '.' ) === 0 || r.bg.indexOf( comp + '.' ) === 0 );
				return h(
					Group,
					{ key: comp, title: schema[ comp ].label },
					Object.keys( props ).map( ( prop ) => {
						const p = props[ prop ];
						const val = values[ prop ] === undefined ? p.default : values[ prop ];
						const set = ( v ) => setSys( setIn( sys, [ 'components', comp, prop ], v ) );
						if ( p.type === 'role' ) {
							return h( RoleProp, { key: prop, label: p.label, value: val, roles, palette: sys.palette, resolved: resolveRoles( sys ), onChange: set } );
						}
						if ( p.type === 'enum' ) {
							return h( EnumProp, { key: prop, label: p.label, value: val, options: p.options, onChange: set } );
						}
						return h( Field, { key: prop, label: p.label, value: val, onChange: set, help: p.help, length: p.type === 'length', type: p.type === 'number' ? 'number' : 'text' } );
					} ),
					related.length > 0 && h( 'ul', { className: 'bl-ds-pairs' }, related.map( ( r, i ) => h( 'li', { key: i }, h( 'span', null, r.use + ': ' ), h( Badge, { row: r } ) ) ) )
				);
			} )
		);
	}
	function RoleProp( { label, value, roles, resolved, onChange } ) {
		const id = useId();
		return h( 'div', { className: 'bl-ds-field' }, h( 'label', { htmlFor: id }, label ),
			h( 'select', { id, value, onChange: ( e ) => onChange( e.target.value ) },
				roles.map( ( r ) => h( 'option', { key: r, value: r }, r + ' ' + ( resolved[ r ] || '' ) ) ) ) );
	}
	function EnumProp( { label, value, options, onChange } ) {
		const id = useId();
		return h( 'div', { className: 'bl-ds-field' }, h( 'label', { htmlFor: id }, label ),
			h( 'select', { id, value, onChange: ( e ) => onChange( e.target.value ) }, options.map( ( o ) => h( 'option', { key: o, value: o }, o ) ) ) );
	}

	function MotionSection( { sys, setSys } ) {
		const id = useId();
		return h(
			Group,
			{ title: 'Motion' },
			h( Field, { label: 'Duration', value: sys.motion.duration, onChange: ( v ) => setSys( setIn( sys, [ 'motion', 'duration' ], v ) ), help: 'For example 150ms. Reduced motion is always respected.' } ),
			h( 'div', { className: 'bl-ds-field' },
				h( 'label', { htmlFor: id }, 'Easing' ),
				h( 'select', { id, value: sys.motion.easing, onChange: ( e ) => setSys( setIn( sys, [ 'motion', 'easing' ], e.target.value ) ) },
					[ 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear' ].map( ( v ) => h( 'option', { key: v, value: v }, v ) ) ) )
		);
	}

	function VariablesSection( { sys, setSys } ) {
		const vars = sys.variables || [];
		const upd = ( i, k, v ) => setSys( setIn( sys, [ 'variables' ], vars.map( ( x, n ) => ( n === i ? Object.assign( {}, x, { [ k ]: v } ) : x ) ) ) );
		return h(
			Group,
			{ title: 'Your own variables' },
			h( 'p', { className: 'bl-desc' }, 'Each variable becomes the CSS custom property --bl-var-name and can be used anywhere.' ),
			vars.map( ( x, i ) =>
				h(
					'div',
					{ key: i, className: 'bl-ds-var' },
					h( Field, { label: 'Name', value: x.name, onChange: ( v ) => upd( i, 'name', v ), help: 'Lowercase letters, numbers and hyphens.' } ),
					h( VarType, { value: x.type, onChange: ( v ) => upd( i, 'type', v ) } ),
					h( Field, { label: 'Value', value: x.value, onChange: ( v ) => upd( i, 'value', v ) } ),
					h( 'button', { type: 'button', className: 'blb', onClick: () => setSys( setIn( sys, [ 'variables' ], vars.filter( ( _, n ) => n !== i ) ) ) }, 'Remove variable ' + ( i + 1 ) )
				)
			),
			h( 'button', { type: 'button', className: 'blb', onClick: () => setSys( setIn( sys, [ 'variables' ], vars.concat( [ { name: '', type: 'size', value: '' } ] ) ) ) }, 'Add variable' )
		);
	}
	function VarType( { value, onChange } ) {
		const id = useId();
		return h( 'div', { className: 'bl-ds-field' }, h( 'label', { htmlFor: id }, 'Type' ),
			h( 'select', { id, value, onChange: ( e ) => onChange( e.target.value ) }, [ 'color', 'size', 'font', 'number', 'text' ].map( ( t ) => h( 'option', { key: t, value: t }, t ) ) ) );
	}

	function ContrastSection( { rows } ) {
		const fails = rows.filter( ( r ) => ! r.pass ).length;
		return h(
			Group,
			{ title: 'Contrast matrix' },
			h( 'p', { role: 'status' }, fails ? `${ fails } of ${ rows.length } pairs are below the WCAG 2.2 AA ratio. This is a warning only: you can still save.` : `All ${ rows.length } pairs meet the WCAG 2.2 AA ratio.` ),
			h( 'table', { className: 'bl-ds-matrix' },
				h( 'caption', { className: 'bl-sr' }, 'Color pairs and their contrast ratios' ),
				h( 'thead', null, h( 'tr', null, [ 'Text or UI', 'On', 'Used for', 'Ratio', 'Needed', 'Result' ].map( ( t ) => h( 'th', { key: t, scope: 'col' }, t ) ) ) ),
				h( 'tbody', null, rows.map( ( r, i ) =>
					h( 'tr', { key: i },
						h( 'td', null, h( 'span', { className: 'bl-ds-chip', style: { background: r.fgHex } } ), ' ' + r.fg + ' ', h( 'code', null, r.fgHex ) ),
						h( 'td', null, h( 'span', { className: 'bl-ds-chip', style: { background: r.bgHex } } ), ' ' + r.bg + ' ', h( 'code', null, r.bgHex ) ),
						h( 'td', null, r.use ),
						h( 'td', null, r.ratio + ':1' ),
						h( 'td', null, r.needed + ':1' ),
						h( 'td', null, h( 'span', { className: 'bl-ds-badge ' + ( r.pass ? 'is-pass' : 'is-fail' ) }, r.pass ? 'Pass' : 'Fails AA' ) )
					) ) ) )
		);
	}

	function BrandSection( { sys, setSys, meta, restore, busy } ) {
		const [ text, setText ] = useState( '' );
		const [ err, setErr ] = useState( '' );
		const fileRef = useRef( null );
		const doExport = () => {
			const blob = new Blob( [ JSON.stringify( sys, null, 2 ) ], { type: 'application/json' } );
			const a = document.createElement( 'a' );
			a.href = URL.createObjectURL( blob );
			a.download = 'builderlab-design-system-' + ( ( sys.brand && sys.brand.name ) || 'brand' ).toLowerCase().replace( /[^a-z0-9]+/g, '-' ) + '.json';
			document.body.appendChild( a );
			a.click();
			a.remove();
		};
		const load = ( raw ) => {
			try {
				const data = JSON.parse( raw );
				if ( ! data || typeof data !== 'object' || Array.isArray( data ) ) {
					throw new Error( 'The JSON must be an object.' );
				}
				setSys( Object.assign( {}, meta.defaults, data ) );
				setErr( '' );
				setText( '' );
			} catch ( e ) {
				setErr( 'Could not read this JSON: ' + e.message );
			}
		};
		return h(
			Fragment,
			null,
			h( Group, { title: 'Brand' }, h( Field, { label: 'Brand name', value: sys.brand.name, onChange: ( v ) => setSys( setIn( sys, [ 'brand', 'name' ], v ) ) } ) ),
			h( Group, { title: 'Export and import' },
				h( 'button', { type: 'button', className: 'blb', onClick: doExport }, 'Export design system (JSON file)' ),
				h( 'div', { className: 'bl-ds-field is-wide' },
					h( 'label', { htmlFor: 'bl-ds-import' }, 'Paste JSON to import' ),
					h( 'textarea', { id: 'bl-ds-import', rows: 6, value: text, onChange: ( e ) => setText( e.target.value ) } ) ),
				h( 'button', { type: 'button', className: 'blb', disabled: ! text.trim(), onClick: () => load( text ) }, 'Load pasted JSON into the editor' ),
				h( 'div', { className: 'bl-ds-field' },
					h( 'label', { htmlFor: 'bl-ds-file' }, 'Or choose a JSON file' ),
					h( 'input', { id: 'bl-ds-file', type: 'file', accept: 'application/json,.json', ref: fileRef, onChange: ( e ) => { const f = e.target.files[ 0 ]; if ( f ) { f.text().then( load ); } } } ) ),
				err && h( 'p', { role: 'alert', className: 'bl-ds-error' }, err ),
				h( 'p', { className: 'bl-desc' }, 'Imported values are loaded into the editor as unsaved changes. Check the preview, then save.' ) ),
			h( Group, { title: 'Defaults' },
				h( 'button', { type: 'button', className: 'blb', onClick: () => setSys( JSON.parse( JSON.stringify( meta.defaults ) ) ) }, 'Load the default design system into the editor' ) ),
			h( Group, { title: 'Revisions' },
				( meta.revisions || [] ).length === 0
					? h( 'p', null, 'No revisions yet. A revision is stored each time you save.' )
					: h( 'ul', { className: 'bl-ds-revs' }, meta.revisions.map( ( r ) =>
						h( 'li', { key: r.index },
							h( 'span', null, `${ r.time } by ${ r.user }${ r.brand ? ', brand "' + r.brand + '"' : '' }${ r.note ? ': ' + r.note : '' }` ),
							h( 'button', { type: 'button', className: 'blb', disabled: busy, onClick: () => restore( r.index ) }, `Restore revision from ${ r.time }` ) ) ) ) )
		);
	}

	/* ---------- app ---------- */

	const SECTIONS = [
		[ 'colors', 'Colors' ], [ 'typography', 'Typography' ], [ 'spacing', 'Spacing and layout' ], [ 'shape', 'Shape and focus' ], [ 'components', 'Components' ],
		[ 'motion', 'Motion' ], [ 'variables', 'Variables' ], [ 'contrast', 'Contrast matrix' ], [ 'brand', 'Brand, export, revisions' ],
	];

	function App() {
		const [ sys, setSys ] = useState( null );
		const [ saved, setSaved ] = useState( '' );
		const [ meta, setMeta ] = useState( {} );
		const [ section, setSection ] = useState( 'colors' );
		const [ warnings, setWarnings ] = useState( [] );
		const [ msg, setMsg ] = useState( '' );
		const [ msgKind, setMsgKind ] = useState( 'info' );
		const [ adjusted, setAdjusted ] = useState( [] );
		const [ busy, setBusy ] = useState( false );
		const [ view, setView ] = useState( 'full' );
		const [ theme, setTheme ] = useState( () => { try { return window.localStorage.getItem( 'builderlabTheme' ) || 'dark'; } catch ( e ) { return 'dark'; } } );
		useEffect( () => { try { window.localStorage.setItem( 'builderlabTheme', theme ); } catch ( e ) { /* storage may be blocked */ } }, [ theme ] );
		const [ frameTick, setFrameTick ] = useState( 0 );
		const [ loadError, setLoadError ] = useState( '' );
		const frame = useRef( null );
		const appliedKeys = useRef( [] );

		const adopt = ( res, message ) => {
			setSys( res.system );
			setSaved( JSON.stringify( res.system ) );
			setMeta( ( m ) => Object.assign( {}, m, { defaults: res.defaults, pairs: res.pairs, roleHelp: res.roleHelp, schema: res.schema, revisions: res.revisions || m.revisions } ) );
			if ( res.warnings ) {
				setWarnings( res.warnings );
			}
			if ( message ) {
				setMsg( message );
			}
		};

		useEffect( () => {
			apiFetch( { path: API } )
				.then( ( res ) => adopt( res, '' ) )
				.catch( ( e ) => setLoadError( ( e && e.message ) || 'Could not load the design system.' ) );
		}, [] );

		const dirty = sys !== null && JSON.stringify( sys ) !== saved;
		useEffect( () => {
			const guard = ( e ) => {
				if ( dirty ) {
					e.preventDefault();
					e.returnValue = '';
				}
			};
			window.addEventListener( 'beforeunload', guard );
			return () => window.removeEventListener( 'beforeunload', guard );
		}, [ dirty ] );

		// Live preview: write the variables into the style guide frame. No reload.
		useEffect( () => {
			const f = frame.current;
			if ( ! sys || ! f || ! f.contentDocument || ! f.contentDocument.documentElement ) {
				return;
			}
			const root = f.contentDocument.documentElement;
			const vars = compileVars( sys, meta.schema );
			appliedKeys.current.forEach( ( k ) => {
				if ( ! ( k in vars ) ) {
					root.style.removeProperty( k );
				}
			} );
			Object.keys( vars ).forEach( ( k ) => root.style.setProperty( k, vars[ k ] ) );
			appliedKeys.current = Object.keys( vars );
		}, [ sys, frameTick, meta.schema ] );

		const rows = useMemo( () => ( sys ? contrastRows( sys, meta.pairs, meta.schema ) : [] ), [ sys, meta.pairs, meta.schema ] );

		if ( loadError ) {
			return h( 'div', { className: 'bl-note is-error', role: 'alert' }, h( 'p', null, loadError ) );
		}
		if ( ! sys ) {
			return h( 'p', null, 'Loading the design system…' );
		}

		const labelFor = ( path ) => {
			const parts = path.split( '.' );
			if ( parts[ 0 ] === 'components' && meta.schema && meta.schema[ parts[ 1 ] ] ) {
				const c = meta.schema[ parts[ 1 ] ];
				const p = c.props[ parts.slice( 2 ).join( '.' ) ];
				return c.label + ', ' + ( p ? p.label : parts.slice( 2 ).join( '.' ) );
			}
			return parts.join( ' > ' );
		};
		const save = () => {
			const sent = leaves( sys, [], {} );
			setBusy( true );
			setMsgKind( 'info' );
			setMsg( 'Saving…' );
			apiFetch( { path: API, method: 'POST', data: { system: sys, note: 'Saved from the design system screen' } } )
				.then( ( res ) => {
					adopt( res, '' );
					const got = leaves( res.system, [], {} );
					const changed = Object.keys( sent ).filter( ( k ) => String( sent[ k ] ) !== String( got[ k ] === undefined ? '' : got[ k ] ) );
					setAdjusted( changed.map( ( k ) => `${ labelFor( k ) }: you entered "${ sent[ k ] }", saved as "${ got[ k ] === undefined || got[ k ] === '' ? 'default' : got[ k ] }"` ) );
					const n = ( res.warnings || [] ).length;
					setMsgKind( 'success' );
					setMsg( 'Saved at ' + new Date().toLocaleTimeString() + '. ' + ( n ? `${ n } warning${ n === 1 ? '' : 's' } below. Warnings never stop a save.` : 'No warnings.' ) );
				} )
				.catch( ( e ) => {
					setMsgKind( 'error' );
					setMsg( 'Could not save: ' + ( ( e && e.message ) || 'unknown error' ) + '. Your changes are still on this screen.' );
				} )
				.finally( () => setBusy( false ) );
		};
		const restore = ( index ) => {
			setBusy( true );
			apiFetch( { path: API + '/restore', method: 'POST', data: { index } } )
				.then( ( res ) => { adopt( res, '' ); setAdjusted( [] ); setMsgKind( 'success' ); setMsg( 'Revision restored and saved at ' + new Date().toLocaleTimeString() + '.' ); } )
				.catch( ( e ) => setMsg( 'Could not restore: ' + ( ( e && e.message ) || 'unknown error' ) ) )
				.finally( () => setBusy( false ) );
		};

		const props = { sys, setSys, meta, rows, restore, busy };
		const body = {
			colors: h( ColorsSection, props ), typography: h( TypographySection, props ), spacing: h( SpacingSection, props ), shape: h( ShapeSection, props ), components: h( ComponentsSection, props ),
			motion: h( MotionSection, props ), variables: h( VariablesSection, props ), contrast: h( ContrastSection, props ), brand: h( BrandSection, props ),
		}[ section ];
		const failing = rows.filter( ( r ) => ! r.pass ).length;
		const title = ( SECTIONS.find( ( s ) => s[ 0 ] === section ) || [ '', '' ] )[ 1 ];

		return h(
			'div',
			{ className: 'bl-ds', 'data-theme': theme },
			h(
				'nav',
				{ className: 'bl-ds-nav', 'aria-label': 'Design system sections' },
				h( 'div', { className: 'bl-ds-title' }, h( 'span', { className: 'bl-ds-kicker' }, 'BuilderLab' ), h( 'span', { className: 'bl-ds-h' }, 'Design system' ) ),
				h( 'p', { className: 'bl-ds-brand' }, 'Brand', h( 'strong', null, sys.brand.name ) ),
				h( 'ul', null, SECTIONS.map( ( s ) =>
					h( 'li', { key: s[ 0 ] }, h( 'button', { type: 'button', className: 'bl-ds-nav__btn', 'aria-current': s[ 0 ] === section ? 'page' : undefined, onClick: () => setSection( s[ 0 ] ) },
						s[ 1 ], s[ 0 ] === 'contrast' && failing > 0 ? h( 'span', { className: 'bl-ds-count' }, ` (${ failing } fail)` ) : null ) ) ) ),
				h( 'button', { type: 'button', className: 'blb bl-ds-theme', onClick: () => setTheme( theme === 'dark' ? 'light' : 'dark' ) }, theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme' )
			),
			h(
				'section',
				{ className: 'bl-ds-guide', 'aria-label': 'Live style guide' },
				h( 'div', { className: 'bl-ds-guide__bar' },
					h( 'strong', null, 'Live style guide' ),
					h( 'div', { role: 'group', 'aria-label': 'Preview width' },
						[ [ 'mobile', '320 px' ], [ 'tablet', '768 px' ], [ 'full', 'Full width' ] ].map( ( v ) =>
							h( 'button', { key: v[ 0 ], type: 'button', className: 'blb', 'aria-pressed': view === v[ 0 ], onClick: () => setView( v[ 0 ] ) }, v[ 1 ] ) ) ) ),
				h( 'div', { className: 'bl-ds-guide__stage' },
					h( 'iframe', { ref: frame, src: cfg.guideUrl, title: 'Live style guide: a sample page built with BuilderLab blocks', className: 'bl-ds-frame is-' + view, onLoad: () => setFrameTick( ( n ) => n + 1 ) } ) )
			),
			h(
				'section',
				{ className: 'bl-ds-panel', 'aria-labelledby': 'bl-ds-title' },
				h( 'div', { className: 'bl-ds-savebar' },
					h( 'button', { type: 'button', className: 'blb blb-primary', disabled: busy || ! dirty, onClick: save }, 'Save changes' ),
					h( 'span', { className: 'bl-ds-dirty' }, dirty ? 'Unsaved changes' : 'All changes saved' ) ),
				h( 'div', { role: 'status', 'aria-live': 'polite', className: 'bl-ds-msg' + ( msg ? ' bl-note is-' + msgKind : '' ) }, msg ? h( 'p', null, msg ) : null ),
				adjusted.length > 0 && h( 'div', { className: 'bl-note is-info' }, h( 'p', null, h( 'strong', null, 'The server adjusted these values' ) ), h( 'ul', null, adjusted.map( ( a, i ) => h( 'li', { key: i }, a ) ) ) ),
				warnings.length > 0 && h( 'div', { className: 'bl-note is-warning' }, h( 'p', null, h( 'strong', null, 'Warnings from the last save' ) ), h( 'ul', null, warnings.map( ( w, i ) => h( 'li', { key: i }, w ) ) ) ),
				h( 'h2', { id: 'bl-ds-title' }, title ),
				body
			)
		);
	}

	const root = document.getElementById( 'builderlab-ds-root' );
	if ( root ) {
		if ( wp.element.createRoot ) {
			wp.element.createRoot( root ).render( h( App ) );
		} else {
			wp.element.render( h( App ), root );
		}
	}
} )( window.wp );
