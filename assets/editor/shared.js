/* BuilderLab editor: shared helpers used by the block screens and the checker.
 * Exposes window.builderlab. */
( function ( wp ) {
	'use strict';

	const { createElement: h, Fragment } = wp.element;
	const { useBlockProps, InspectorControls } = wp.blockEditor;
	const { PanelBody, TextControl, TextareaControl, SelectControl, ToggleControl, Button } = wp.components;
	const SSR = wp.serverSideRender && ( wp.serverSideRender.default || wp.serverSideRender );

	const BL = ( window.builderlab = window.builderlab || {} );
	BL.rules = BL.rules || [];
	BL.h = h;

	/** Plain text of an HTML string. */
	BL.plain = ( html ) => {
		const d = document.createElement( 'div' );
		d.innerHTML = html || '';
		return ( d.textContent || '' ).trim();
	};

	/** Non-empty trimmed lines. */
	BL.lines = ( text ) => String( text || '' ).split( /\r?\n/ ).map( ( l ) => l.trim() ).filter( Boolean );

	/** Register a rule: fn( block, add ) where add( rule, severity, wcag, message, axeId? ). */
	BL.addRule = ( name, fn ) => BL.rules.push( { name, fn } );

	/**
	 * Repeating group editor. fields: [{ key, label, type: 'text'|'textarea'|'select'|'toggle', options }]
	 */
	BL.Repeater = ( { label, items, fields, blank, onChange, addLabel, itemLabel } ) => {
		const list = Array.isArray( items ) ? items : [];
		const set = ( i, key, value ) => onChange( list.map( ( it, n ) => ( n === i ? Object.assign( {}, it, { [ key ]: value } ) : it ) ) );
		const move = ( i, dir ) => {
			const j = i + dir;
			if ( j < 0 || j >= list.length ) {
				return;
			}
			const next = list.slice();
			[ next[ i ], next[ j ] ] = [ next[ j ], next[ i ] ];
			onChange( next );
		};
		return h(
			'div',
			{ className: 'bl-repeater', role: 'group', 'aria-label': label },
			list.map( ( it, i ) =>
				h(
					'fieldset',
					{ key: i, className: 'bl-repeater__item' },
					h( 'legend', null, `${ itemLabel || 'Item' } ${ i + 1 }` ),
					fields.map( ( f ) => {
						const common = { key: f.key, label: f.label, value: it[ f.key ] === undefined ? '' : it[ f.key ], onChange: ( v ) => set( i, f.key, v ) };
						if ( f.type === 'textarea' ) {
							return h( TextareaControl, Object.assign( {}, common, { rows: 3, help: f.help } ) );
						}
						if ( f.type === 'select' ) {
							return h( SelectControl, Object.assign( {}, common, { options: f.options } ) );
						}
						if ( f.type === 'toggle' ) {
							return h( ToggleControl, { key: f.key, label: f.label, checked: !! it[ f.key ], onChange: ( v ) => set( i, f.key, v ) } );
						}
						return h( TextControl, Object.assign( {}, common, { help: f.help } ) );
					} ),
					h(
						'div',
						{ className: 'bl-repeater__actions' },
						h( Button, { variant: 'secondary', disabled: i === 0, onClick: () => move( i, -1 ) }, 'Move up' ),
						h( Button, { variant: 'secondary', disabled: i === list.length - 1, onClick: () => move( i, 1 ) }, 'Move down' ),
						h( Button, { variant: 'secondary', isDestructive: true, onClick: () => onChange( list.filter( ( _, n ) => n !== i ) ) }, 'Remove' )
					)
				)
			),
			h( Button, { variant: 'primary', onClick: () => onChange( list.concat( [ Object.assign( {}, blank ) ] ) ) }, addLabel || 'Add item' )
		);
	};

	/**
	 * Builds an edit component that shows the real server output on the canvas,
	 * so the checker scans the same markup visitors get.
	 */
	BL.ssrEdit = ( name, controls ) => ( props ) => {
		const blockProps = useBlockProps();
		const postId = wp.data.select( 'core/editor' ).getCurrentPostId();
		return h(
			Fragment,
			null,
			h( InspectorControls, null, controls( props ) ),
			h(
				'div',
				blockProps,
				SSR
					? h( SSR, { block: name, attributes: props.attributes, urlQueryArgs: { post_id: postId }, EmptyResponsePlaceholder: () => h( 'p', { className: 'bl-empty' }, 'Nothing to show yet. Fill in the settings on the right.' ) } )
					: h( 'p', null, 'Preview is not available.' )
			)
		);
	};

	BL.Panel = ( title, children, open ) => h( PanelBody, { title, initialOpen: open !== false }, children );
} )( window.wp );
