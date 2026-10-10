/* BuilderLab visual editor.
 * Left: elements and properties. Center: live canvas. Right: layers and accessibility.
 * Spike shortcut: no build step, React through wp.element. */
( function ( wp ) {
	'use strict';

	const { createElement: h, useState, useEffect, useRef, useMemo, useCallback, Fragment } = wp.element;
	const apiFetch = wp.apiFetch;
	const cfg = window.builderlabApp || {};
	const API = '/builderlab/v1/editor/' + cfg.postId;

	/* ---------- tree helpers (immutable) ---------- */

	let COMPONENTS = []; // reusable component templates, filled when the editor has loaded
	const newId = () => 'n' + Math.random().toString( 36 ).slice( 2, 12 );
	const clone = ( o ) => JSON.parse( JSON.stringify( o ) );

	function find( nodes, id, parent ) {
		for ( let i = 0; i < nodes.length; i++ ) {
			if ( nodes[ i ].id === id ) {
				return { node: nodes[ i ], parent: parent || null, list: nodes, index: i };
			}
			const r = find( nodes[ i ].children || [], id, nodes[ i ] );
			if ( r ) {
				return r;
			}
		}
		return null;
	}
	function mapNodes( nodes, fn ) {
		return nodes.map( ( n ) => {
			const m = fn( n );
			return m.children && m.children.length ? Object.assign( {}, m, { children: mapNodes( m.children, fn ) } ) : m;
		} );
	}
	function removeNode( nodes, id ) {
		return nodes.filter( ( n ) => n.id !== id ).map( ( n ) => ( n.children && n.children.length ? Object.assign( {}, n, { children: removeNode( n.children, id ) } ) : n ) );
	}
	/** Inserts into the list that belongs to parentId (null is the root list). */
	function insertInto( nodes, parentId, index, node ) {
		if ( parentId === null ) {
			const c = nodes.slice();
			c.splice( index === undefined || index < 0 ? c.length : index, 0, node );
			return c;
		}
		return nodes.map( ( n ) => {
			if ( n.id === parentId ) {
				const kids = ( n.children || [] ).slice();
				kids.splice( index === undefined || index < 0 ? kids.length : index, 0, node );
				return Object.assign( {}, n, { children: kids } );
			}
			return n.children && n.children.length ? Object.assign( {}, n, { children: insertInto( n.children, parentId, index, node ) } ) : n;
		} );
	}
	function reId( node ) {
		const c = clone( node );
		const go = ( n ) => {
			n.id = newId();
			( n.children || [] ).forEach( go );
		};
		go( c );
		if ( c.attrs && c.attrs.formKey ) {
			c.attrs.formKey = 'f' + Math.random().toString( 36 ).slice( 2, 10 );
		}
		return c;
	}
	function move( tree, id, dir ) {
		const f = find( tree, id );
		if ( ! f ) {
			return tree;
		}
		const { node, parent, index } = f;
		const parentId = parent ? parent.id : null;
		const siblings = f.list;
		if ( dir === 'up' && index > 0 ) {
			return insertInto( removeNode( tree, id ), parentId, index - 1, node );
		}
		if ( dir === 'down' && index < siblings.length - 1 ) {
			return insertInto( removeNode( tree, id ), parentId, index + 1, node );
		}
		if ( dir === 'out' && parent ) {
			const pf = find( tree, parent.id );
			return insertInto( removeNode( tree, id ), pf.parent ? pf.parent.id : null, pf.index + 1, node );
		}
		if ( dir === 'in' && index > 0 ) {
			const prev = siblings[ index - 1 ];
			if ( prev.name === 'builderlab/container' ) {
				return insertInto( removeNode( tree, id ), prev.id, -1, node );
			}
		}
		return tree;
	}
	/** Places a node before, after or inside the target. */
	function placeRelative( tree, node, targetId, zone ) {
		const t = targetId ? find( tree, targetId ) : null;
		if ( ! t ) {
			return insertInto( tree, null, -1, node );
		}
		if ( zone === 'inside' && t.node.name === 'builderlab/container' ) {
			return insertInto( tree, t.node.id, -1, node );
		}
		return insertInto( tree, t.parent ? t.parent.id : null, zone === 'before' ? t.index : t.index + 1, node );
	}
	function moveTo( tree, id, targetId, zone ) {
		if ( id === targetId ) { return tree; }
		const f = find( tree, id );
		if ( ! f || find( [ f.node ], targetId ) ) { return tree; } // never into itself or its own children
		return placeRelative( removeNode( tree, id ), f.node, targetId, zone );
	}
	const zoneFor = ( y, isContainer ) => ( y < 0.28 ? 'before' : y > 0.72 ? 'after' : isContainer ? 'inside' : y < 0.5 ? 'before' : 'after' );
	const canMove = ( tree, id, dir ) => {
		const f = find( tree, id );
		if ( ! f ) {
			return false;
		}
		if ( dir === 'up' ) { return f.index > 0; }
		if ( dir === 'down' ) { return f.index < f.list.length - 1; }
		if ( dir === 'out' ) { return !! f.parent; }
		if ( dir === 'in' ) { return f.index > 0 && f.list[ f.index - 1 ].name === 'builderlab/container'; }
		return false;
	};

	/* ---------- text and color helpers ---------- */

	const plain = ( html ) => {
		const d = document.createElement( 'div' );
		d.innerHTML = html || '';
		return ( d.textContent || '' ).trim();
	};
	const lines = ( t ) => String( t || '' ).split( /\r?\n/ ).map( ( l ) => l.trim() ).filter( Boolean );
	const HEX6 = /^#[0-9a-f]{6}$/i;
	function lum( hex ) {
		const n = parseInt( hex.slice( 1 ), 16 );
		return [ ( n >> 16 ) & 255, ( n >> 8 ) & 255, n & 255 ]
			.map( ( c ) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow( ( c + 0.055 ) / 1.055, 2.4 ); } )
			.reduce( ( a, c, i ) => a + c * [ 0.2126, 0.7152, 0.0722 ][ i ], 0 );
	}
	const ratio = ( a, b ) => ( Math.max( lum( a ), lum( b ) ) + 0.05 ) / ( Math.min( lum( a ), lum( b ) ) + 0.05 );

	/* ---------- accessibility rules (same ones as the block editor checker) ---------- */

	const VAGUE = /^(click here|here|read more|more|learn more|link|submit|go|click)$/i;
	const FILE_LIKE = /\.(png|jpe?g|gif|webp|svg|avif)$/i;

	function checkTree( tree, roles, titleOf ) {
		const out = [];
		let prev = 1;
		const resolve = ( v ) => ( HEX6.test( v || '' ) ? v : roles[ v ] || '' );
		const walk = ( nodes ) => nodes.forEach( ( n ) => {
			const a = n.attrs || {};
			const add = ( severity, wcag, message ) => out.push( { id: n.id, severity, wcag, message, label: titleOf( n ) } );
			switch ( n.name ) {
				case 'builderlab/heading': {
					const level = Number( a.level ) || 2;
					if ( ! plain( a.content ) ) { add( 'error', '2.4.6', 'Heading is empty. Add text or remove it.' ); }
					if ( level === 1 ) { add( 'warning', '1.3.1', 'This page probably already has an h1 (the page title). Use h2 or lower here.' ); }
					if ( level > prev + 1 ) { add( 'error', '1.3.1', `Heading level skipped: H${ prev } to H${ level }. Use H${ prev + 1 }.` ); }
					prev = level;
					break;
				}
				case 'builderlab/image':
					if ( a.source && a.source !== 'static' ) {
						if ( a.source !== 'featured' && ! ( a.field || '' ).trim() ) { add( 'warning', '1.1.1', 'Choose which field supplies the picture.' ); }
						if ( ! a.decorative && ! ( a.alt || '' ).trim() ) { add( 'warning', '1.1.1', 'The alt text comes from the media library item. Add a fallback alt text here in case the picture has none, or mark the image as decorative.' ); }
						break;
					}
					if ( ( a.url || a.id ) && ! a.decorative ) {
						const alt = ( a.alt || '' ).trim();
						if ( ! alt ) { add( 'error', '1.1.1', 'Image has no alt text. Describe it, or mark it as decorative.' ); }
						else if ( FILE_LIKE.test( alt ) ) { add( 'warning', '1.1.1', 'Alt text looks like a file name. Describe what the image shows.' ); }
					}
					if ( ! a.url && ! a.id ) { add( 'warning', '1.1.1', 'No image chosen yet. It will not be shown on the page.' ); }
					break;
				case 'builderlab/button':
					if ( ! plain( a.content ) ) { add( 'error', '4.1.2', 'Button has no text, so it has no accessible name.' ); }
					else if ( VAGUE.test( plain( a.content ) ) ) { add( 'warning', '2.4.4', `"${ plain( a.content ) }" does not say where it goes or what it does. Use a specific label.` ); }
					if ( a.kind !== 'button' && ! ( a.url || '' ).trim() ) { add( 'error', '2.4.4', 'Link has no destination. It will not be shown on the page.' ); }
					break;
				case 'builderlab/container':
					if ( a.tag === 'nav' && ! ( a.label || '' ).trim() ) { add( 'warning', '1.3.1', 'A navigation landmark should have a name, so people can tell navigations apart.' ); }
					break;
				case 'builderlab/text':
					if ( ! plain( a.content ) ) { add( 'warning', '1.3.1', 'Empty text block. Add text or remove it.' ); }
					break;
				case 'builderlab/list':
					if ( ! lines( a.items ).length ) { add( 'warning', '1.3.1', 'The list has no items.' ); }
					break;
				case 'builderlab/quote':
					if ( ! plain( a.content ) ) { add( 'warning', '1.3.1', 'The quotation is empty.' ); }
					break;
				case 'builderlab/table': {
					const rows = lines( a.data );
					if ( ! rows.length ) { add( 'warning', '1.3.1', 'The table has no data.' ); break; }
					if ( ! plain( a.caption ) ) { add( 'error', '1.3.1', 'The table has no caption. Add a short caption that names it.' ); }
					const header = a.headerRow !== false;
					if ( ! header && ! a.rowHeaders ) { add( 'error', '1.3.1', 'The table has no header cells. Turn on a header row or a header column.' ); }
					if ( header && rows[ 0 ].split( '|' ).some( ( c ) => ! c.trim() ) ) { add( 'error', '1.3.1', 'A header cell is empty. Every column needs a header.' ); }
					break;
				}
				case 'builderlab/alert':
					if ( ! plain( a.title ) && ! plain( a.content ) ) { add( 'warning', '1.3.1', 'The alert has no text.' ); }
					break;
				case 'builderlab/accordion':
				case 'builderlab/tabs': {
					const items = a.items || [];
					if ( ! items.length ) { add( 'warning', '1.3.1', 'There are no items.' ); }
					if ( items.some( ( i ) => ! plain( i.title ) ) ) { add( 'error', '4.1.2', 'An item has no title, so its control has no name.' ); }
					if ( n.name === 'builderlab/tabs' ) {
						if ( items.length < 2 ) { add( 'warning', '1.3.1', 'Tabs need at least two tabs. Use plain content instead.' ); }
						if ( ! plain( a.label ) ) { add( 'warning', '4.1.2', 'Name the tab group, for example "Product details".' ); }
					}
					break;
				}
				case 'builderlab/template':
					if ( ! a.templateId ) { add( 'warning', '1.3.1', 'No component chosen yet. Nothing is shown on the page.' ); }
					break;
				case 'builderlab/nav':
					if ( ! plain( a.label ) ) { add( 'error', '4.1.2', 'The navigation has no name. Name it so people can tell navigations apart.' ); }
					break;
				case 'builderlab/loop': {
					const card = Array.isArray( a.card ) ? a.card : [ { field: 'title' } ];
					if ( ! card.length ) { add( 'warning', '1.3.1', 'The card has no fields, so the list shows nothing.' ); }
					else if ( ! card.some( ( x ) => x.field === 'title' ) && card.some( ( x ) => x.link ) ) { add( 'warning', '2.4.4', 'The cards have links but no title field. Add the title so each link has a name.' ); }
					break;
				}
				case 'builderlab/search':
					if ( ! plain( a.label ) ) { add( 'error', '3.3.2', 'The search field has no label. It will not be shown on the page.' ); }
					break;
				case 'builderlab/form': {
					const f = a.fields || [];
					if ( ! f.length ) { add( 'warning', '1.3.1', 'The form has no fields, so it will not be shown.' ); }
					if ( f.some( ( x ) => ! plain( x.label ) ) ) { add( 'error', '3.3.2', 'A form field has no label. Fields without a label are not shown.' ); }
					if ( f.some( ( x ) => /\b(name|e-?mail|phone|tel|address)\b/i.test( x.label || '' ) && ! x.autocomplete && ! [ 'email', 'tel' ].includes( x.type ) ) ) {
						add( 'warning', '1.3.5', 'A personal-data field has no autocomplete value. Set one so browsers can fill it in.' );
					}
					break;
				}
				default:
			}
			if ( [ 'builderlab/heading', 'builderlab/text', 'builderlab/button' ].includes( n.name ) ) {
				const fg = resolve( a.fg );
				const bg = resolve( a.bg );
				if ( fg || bg ) {
					const isBtn = n.name === 'builderlab/button';
					const quiet = a.variant === 'outline' || a.variant === 'ghost';
					const f2 = fg || ( isBtn ? roles[ quiet ? 'primary' : 'on-primary' ] : roles.text );
					const b2 = bg || ( isBtn ? roles[ quiet ? 'bg' : 'primary' ] : roles.bg );
					const need = n.name === 'builderlab/heading' && ( Number( a.level ) || 2 ) <= 4 ? 3 : 4.5;
					if ( f2 && b2 ) {
						const r = ratio( f2, b2 );
						if ( r < need ) { add( 'error', '1.4.3', `Contrast ${ r.toFixed( 2 ) }:1 is below the ${ need }:1 needed for AA.` ); }
					}
				}
			}
			// Text smaller than 12px is hard to read and hard to resize cleanly.
			if ( a.fontSize ) {
				const small = Object.keys( a.fontSize ).filter( ( dv ) => {
					const m = /^(\d*\.?\d+)(px|rem|em)$/i.exec( String( a.fontSize[ dv ] ) );
					if ( ! m ) { return false; }
					const px = m[ 2 ].toLowerCase() === 'px' ? parseFloat( m[ 1 ] ) : parseFloat( m[ 1 ] ) * 16;
					return px < 12;
				} );
				if ( small.length ) { add( 'warning', '1.4.4', 'Text smaller than 12 pixels on ' + small.join( ' and ' ) + ' is hard to read. Use at least 12px, and 16px for body text where you can.' ); }
			}
			if ( n.children && n.children.length ) { walk( n.children ); }
		} );
		walk( tree );
		return out;
	}

	/* ---------- sizes in the usual formats ---------- */

	const UNITS = [ 'px', 'rem', 'em', '%', 'vw', 'vh' ];
	function parseSize( v ) {
		const m = /^(-?\d*\.?\d+)\s*(px|rem|em|%|vw|vh)?$/i.exec( String( v === undefined || v === null ? '' : v ).trim() );
		return m ? { n: m[ 1 ], u: ( m[ 2 ] || '' ).toLowerCase() } : { n: '', u: '' };
	}
	/** A number with a unit list. Typing "2rem", "5%" or "3vw" also works; a bare number takes the chosen unit. */
	function SizeInput( { label, value, onChange, help } ) {
		const id = useUid();
		const parsed = parseSize( value );
		const [ unit, setUnit ] = useState( parsed.u || 'px' );
		const [ raw, setRaw ] = useState( value || '' );
		useEffect( () => { setRaw( value || '' ); if ( parsed.u ) { setUnit( parsed.u ); } }, [ value ] );
		const commit = ( text, u ) => {
			const p = parseSize( text );
			if ( ! String( text ).trim() ) { onChange( '' ); return; }
			if ( p.n === '' ) { onChange( String( text ).trim() ); return; } // the server explains what it cannot read
			onChange( p.n + ( p.u || u ) );
		};
		const unreadable = String( raw ).trim() !== '' && parseSize( raw ).n === '';
		return h( 'div', { className: 'blf' },
			h( 'label', { htmlFor: id }, label ),
			h( 'div', { className: 'blf-size' },
				h( 'input', { id, type: 'text', inputMode: 'decimal', value: raw, placeholder: 'For example 24', 'aria-invalid': unreadable ? 'true' : undefined, 'aria-describedby': ( unreadable ? id + '-bad ' : '' ) + ( help ? id + '-h' : '' ) || undefined,
					onChange: ( e ) => { setRaw( e.target.value ); const p = parseSize( e.target.value ); if ( p.n !== '' && p.u ) { onChange( p.n + p.u ); setUnit( p.u ); } },
					onBlur: () => commit( raw, unit ) } ),
				h( 'select', { 'aria-label': label + ' unit', value: unit, onChange: ( e ) => { setUnit( e.target.value ); const p = parseSize( raw ); if ( p.n !== '' ) { onChange( p.n + e.target.value ); } } },
					UNITS.map( ( u ) => h( 'option', { key: u, value: u }, u ) ) ) ),
			unreadable && h( 'p', { id: id + '-bad', className: 'blf-help' }, 'This is not a size. Use a number with a unit, for example 24px, 1.5rem, 5% or 3vw. It is ignored until it is readable.' ),
			help && h( 'p', { id: id + '-h', className: 'blf-help' }, help ) );
	}

	const GAP_TOKENS = [ [ '0', 'None' ], [ '1', 'XS' ], [ '2', 'S' ], [ '3', 'M (default)' ], [ '4', 'L' ], [ '5', 'XL' ], [ '6', '2XL' ] ];
	function GapField( { attrs, set } ) {
		const id = useUid();
		const custom = !! attrs.gapCustom;
		const split = !! ( attrs.rowGap || attrs.columnGap );
		const [ showSplit, setShowSplit ] = useState( split );
		return h( Fragment, null,
			h( 'div', { className: 'blf' },
				h( 'label', { htmlFor: id }, 'Gap between elements' ),
				h( 'select', { id, value: custom ? '__custom' : String( attrs.gap === undefined ? 3 : attrs.gap ), onChange: ( e ) => {
					if ( e.target.value === '__custom' ) { set( 'gapCustom', '16px' ); } else { set( { gap: Number( e.target.value ), gapCustom: '' } ); }
				} }, GAP_TOKENS.map( ( g ) => h( 'option', { key: g[ 0 ], value: g[ 0 ] }, g[ 1 ] ) ), h( 'option', { value: '__custom' }, 'Custom size…' ) ) ),
			custom && h( SizeInput, { label: 'Custom gap', value: attrs.gapCustom, onChange: ( v ) => set( 'gapCustom', v ), help: 'px, rem, em, %, vw or vh.' } ),
			h( 'div', { className: 'blf blf-check' }, h( 'label', null, h( 'input', { type: 'checkbox', checked: showSplit, onChange: ( e ) => { setShowSplit( e.target.checked ); if ( ! e.target.checked ) { set( { rowGap: '', columnGap: '' } ); } } } ), ' Different row and column gaps' ) ),
			showSplit && h( Fragment, null,
				h( SizeInput, { label: 'Row gap (between lines)', value: attrs.rowGap || '', onChange: ( v ) => set( 'rowGap', v ), help: 'Empty follows the gap above.' } ),
				h( SizeInput, { label: 'Column gap (between items in a line)', value: attrs.columnGap || '', onChange: ( v ) => set( 'columnGap', v ), help: 'Empty follows the gap above.' } ) ) );
	}

	/** A choice with one value per device, as buttons. Empty means "default". */
	function DeviceChoice( { label, options, value, device, set, keyName, hint } ) {
		const vals = value || {};
		const current = vals[ device.id ] || '';
		const inherited = device.id === 'tablet' ? vals.desktop : device.id === 'mobile' ? vals.tablet || vals.desktop : '';
		const write = ( v ) => { const n = Object.assign( {}, vals ); if ( v ) { n[ device.id ] = v; } else { delete n[ device.id ]; } set( keyName, n ); };
		const labelOf = ( v ) => ( options.find( ( o ) => o[ 0 ] === v ) || [ '', v ] )[ 1 ];
		return h( 'fieldset', { className: 'blf-choice' },
			h( 'legend', null, h( 'span', { className: 'dashicons ' + device.icon, 'aria-hidden': 'true' } ), ' ' + label + ' on ' + device.label.toLowerCase() ),
			h( 'div', { className: 'blf-seg', role: 'group', 'aria-label': label + ' on ' + device.label.toLowerCase() },
				h( 'button', { type: 'button', className: 'blb', 'aria-pressed': ! current, onClick: () => write( '' ) }, 'Default' ),
				options.map( ( o ) => h( 'button', { key: o[ 0 ], type: 'button', className: 'blb', 'aria-pressed': current === o[ 0 ], onClick: () => write( o[ 0 ] ) }, o[ 1 ] ) ) ),
			h( 'p', { className: 'blf-help' }, current ? 'Set for ' + device.label.toLowerCase() + ': ' + labelOf( current ) + '.' : inherited ? 'Follows the larger device: ' + labelOf( inherited ) + '.' : hint || 'Uses the default.' ) );
	}

	/** One side of margin or padding. Keeps partial text such as "-" or "2r" until it is a complete value. */
	function SideInput( { label, value, placeholder, onChange, allowAuto } ) {
		const shown = ( v ) => ( ! v ? '' : v === 'auto' ? 'auto' : parseSize( v ).n );
		const [ raw, setRaw ] = useState( shown( value ) );
		useEffect( () => { setRaw( shown( value ) ); }, [ value ] );
		return h( 'input', { type: 'text', inputMode: 'decimal', 'aria-label': label, value: raw, placeholder: placeholder || '',
			onChange: ( e ) => {
				const t = e.target.value;
				setRaw( t );
				const tt = t.trim().toLowerCase();
				if ( tt === '' || ( allowAuto && tt === 'auto' ) || parseSize( tt ).n !== '' ) { onChange( tt ); }
			} } );
	}

	/** Keeps only simple inline formatting from typed or pasted text. */
	function cleanInline( html ) {
		const allowed = { B: 1, STRONG: 1, I: 1, EM: 1, A: 1, CODE: 1, KBD: 1, MARK: 1, SMALL: 1, SUB: 1, SUP: 1, BR: 1, ABBR: 1, Q: 1, CITE: 1 };
		const tpl = document.createElement( 'template' );
		tpl.innerHTML = html;
		const walk = ( parent ) => {
			Array.from( parent.childNodes ).forEach( ( n ) => {
				if ( n.nodeType === 1 ) {
					walk( n );
					if ( ! allowed[ n.tagName ] ) {
						const isBlock = /^(DIV|P|LI)$/.test( n.tagName );
						while ( n.firstChild ) { parent.insertBefore( n.firstChild, n ); }
						if ( isBlock && n.nextSibling ) { parent.insertBefore( document.createElement( 'br' ), n ); }
						parent.removeChild( n );
					} else {
						Array.from( n.attributes ).forEach( ( a ) => {
							const keep = ( n.tagName === 'A' && a.name === 'href' ) || ( n.tagName === 'ABBR' && a.name === 'title' );
							if ( ! keep ) { n.removeAttribute( a.name ); }
						} );
						if ( n.tagName === 'A' && /^\s*javascript:/i.test( n.getAttribute( 'href' ) || '' ) ) { n.removeAttribute( 'href' ); }
					}
				}
			} );
		};
		walk( tpl.content );
		let out = tpl.innerHTML.replace( /(<br>\s*)+$/i, '' );
		out = out.replace( /&nbsp;/g, ' ' );
		return out;
	}
	const EDITABLE = {
		'builderlab/heading': { key: 'content', rich: true, single: true },
		'builderlab/text': { key: 'content', rich: true },
		'builderlab/button': { key: 'content', rich: false, single: true },
		'builderlab/quote': { key: 'content', rich: true, selector: '.bl-quote__text p' },
	};
	const escapeHtml = ( t ) => String( t ).replace( /&/g, '&amp;' ).replace( /</g, '&lt;' ).replace( />/g, '&gt;' );

	/** Typography for text elements: font size, line height and alignment, each per device. */
	function TypographyFields( { attrs, set, device, align } ) {
		const idSize = useUid();
		const idLine = useUid();
		const size = attrs.fontSize || {};
		const line = attrs.lineHeight || {};
		const sizeNow = size[ device.id ] || '';
		const inheritedSize = device.id === 'tablet' ? size.desktop : device.id === 'mobile' ? size.tablet || size.desktop : '';
		const wr = ( obj, k ) => ( v ) => { const n = Object.assign( {}, obj ); if ( v ) { n[ device.id ] = v; } else { delete n[ device.id ]; } set( k, n ); };
		return h( Fragment, null,
			! align && h( Fragment, null,
				h( SizeInput, { key: 'fz' + device.id, label: 'Font size on ' + device.label.toLowerCase(), value: sizeNow, onChange: wr( size, 'fontSize' ), help: inheritedSize && ! sizeNow ? 'Follows the larger device: ' + inheritedSize + '.' : 'Empty keeps the design system size. Keep body text at 16px (1rem) or more where you can.' } ),
				h( 'div', { className: 'blf' },
					h( 'label', { htmlFor: idLine }, h( 'span', { className: 'dashicons ' + device.icon, 'aria-hidden': 'true' } ), ' Line height on ' + device.label.toLowerCase() ),
					h( 'input', { id: idLine, type: 'text', inputMode: 'decimal', value: line[ device.id ] || '', placeholder: 'For example 1.5', onChange: ( e ) => wr( line, 'lineHeight' )( e.target.value.trim() ) } ),
					h( 'p', { className: 'blf-help' }, 'A number such as 1.5, or a size such as 24px. At least 1.5 is recommended for body text.' ) ) ),
			h( DeviceChoice, { label: 'Text align', keyName: 'textAlign', value: attrs.textAlign, device, set, options: [ [ 'left', 'Left' ], [ 'center', 'Center' ], [ 'right', 'Right' ], [ 'justify', 'Justify' ] ], hint: 'Follows the theme.' } ) );
	}
	const TEXT_BLOCKS = [ 'builderlab/heading', 'builderlab/text', 'builderlab/button', 'builderlab/list', 'builderlab/quote', 'builderlab/alert' ];

	/** Margin or padding: four sides, one unit, a link toggle, a value per device. */
	function SpacingField( { label, keyName, value, device, set, margin } ) {
		const all = value || {};
		const cur = all[ device.id ] || {};
		const sides = [ [ 'top', 'Top' ], [ 'right', 'Right' ], [ 'bottom', 'Bottom' ], [ 'left', 'Left' ] ];
		const numOf = ( v ) => ( v === 'auto' ? 'auto' : parseSize( v ).n );
		const unitOf = ( v ) => parseSize( v ).u;
		const firstUnit = sides.map( ( s ) => unitOf( cur[ s[ 0 ] ] ) ).find( Boolean ) || 'px';
		const [ unit, setUnit ] = useState( firstUnit );
		const filled = sides.filter( ( s ) => cur[ s[ 0 ] ] );
		const [ linked, setLinked ] = useState( filled.length === 0 || ( filled.length === 4 && new Set( sides.map( ( s ) => cur[ s[ 0 ] ] ) ).size === 1 ) );
		const write = ( next ) => {
			const out = Object.assign( {}, all );
			const clean = {};
			Object.keys( next ).forEach( ( k ) => { if ( next[ k ] !== '' && next[ k ] !== undefined ) { clean[ k ] = next[ k ]; } } );
			if ( Object.keys( clean ).length ) { out[ device.id ] = clean; } else { delete out[ device.id ]; }
			set( keyName, out );
		};
		const withUnit = ( text, u ) => {
			const t = String( text ).trim().toLowerCase();
			if ( t === '' ) { return ''; }
			if ( t === 'auto' && margin ) { return 'auto'; }
			const p = parseSize( t );
			return p.n === '' ? '' : p.n + ( p.u || u );
		};
		const change = ( side, text ) => {
			const typedUnit = parseSize( text ).u;
			if ( typedUnit && typedUnit !== unit ) { setUnit( typedUnit ); }
			const v = withUnit( text, typedUnit || unit );
			if ( linked ) { write( { top: v, right: v, bottom: v, left: v } ); } else { write( Object.assign( {}, cur, { [ side ]: v } ) ); }
		};
		const inherited = ( side ) => ( device.id === 'tablet' ? ( all.desktop || {} )[ side ] : device.id === 'mobile' ? ( all.tablet || all.desktop || {} )[ side ] : '' );
		const id = useUid();
		return h( 'fieldset', { className: 'blf-choice blf-space' },
			h( 'legend', null, h( 'span', { className: 'dashicons ' + device.icon, 'aria-hidden': 'true' } ), ' ' + label + ' on ' + device.label.toLowerCase() ),
			h( 'div', { className: 'blf-space__row' },
				sides.map( ( s ) => h( 'div', { key: s[ 0 ], className: 'blf-space__cell' },
					h( SideInput, { label: label + ' ' + s[ 1 ].toLowerCase() + ' on ' + device.label.toLowerCase(), value: cur[ s[ 0 ] ], placeholder: numOf( inherited( s[ 0 ] ) ) || '', allowAuto: !! margin, onChange: ( text ) => change( s[ 0 ], text ) } ),
					h( 'span', { className: 'blf-space__name' }, s[ 1 ] ) ) ),
				h( 'button', { type: 'button', className: 'blb blb-icon', 'aria-pressed': linked, 'aria-label': 'Link all four ' + label.toLowerCase() + ' sides on ' + device.label.toLowerCase(), title: 'Link all four sides', onClick: () => { setLinked( ! linked ); if ( ! linked && cur.top ) { write( { top: cur.top, right: cur.top, bottom: cur.top, left: cur.top } ); } } },
					h( 'span', { className: 'dashicons ' + ( linked ? 'dashicons-admin-links' : 'dashicons-editor-unlink' ), 'aria-hidden': 'true' } ) ) ),
			h( 'div', { className: 'blf-size' },
				h( 'select', { 'aria-label': label + ' unit', value: unit, onChange: ( e ) => { const u = e.target.value; setUnit( u ); const n = {}; sides.forEach( ( s ) => { const p = parseSize( cur[ s[ 0 ] ] ); n[ s[ 0 ] ] = cur[ s[ 0 ] ] === 'auto' ? 'auto' : p.n !== '' ? p.n + u : ''; } ); write( n ); } },
					[ 'px', 'rem', 'em', '%', 'vw', 'vh' ].map( ( u ) => h( 'option', { key: u, value: u }, u ) ) ),
				h( 'button', { type: 'button', className: 'blb', disabled: ! filled.length, onClick: () => write( {} ) }, 'Reset' ) ),
			h( 'p', { className: 'blf-help' }, margin ? 'Space outside the element. Negative values and "auto" are allowed. Empty keeps the default.' : 'Space inside the element. Empty keeps the default.' ) );
	}

	/** Controls for an element inside a flex container: align self, order and size. */
	function FlexItemFields( { attrs, set, device } ) {
		const id = useUid();
		const order = attrs.order || {};
		return h( 'fieldset', { className: 'blf-items' },
			h( 'legend', null, 'Inside a container' ),
			h( DeviceChoice, { label: 'Align self', keyName: 'alignSelf', value: attrs.alignSelf, device, set, options: [ [ 'start', 'Start' ], [ 'center', 'Center' ], [ 'end', 'End' ], [ 'stretch', 'Stretch' ] ], hint: 'Follows the container\'s align items.' } ),
			h( DeviceChoice, { label: 'Size', keyName: 'flexSize', value: attrs.flexSize, device, set, options: [ [ 'grow', 'Grow to fill' ], [ 'shrink', 'Shrink only' ] ], hint: 'Keeps its own size.' } ),
			h( 'div', { className: 'blf' },
				h( 'label', { htmlFor: id }, h( 'span', { className: 'dashicons ' + device.icon, 'aria-hidden': 'true' } ), ' Order on ' + device.label.toLowerCase() ),
				h( 'input', { id, type: 'number', min: -99, max: 99, step: 1, value: order[ device.id ] === undefined ? '' : order[ device.id ], placeholder: 'Default', 'aria-describedby': id + '-h',
					onChange: ( e ) => { const n = Object.assign( {}, order ); if ( e.target.value === '' ) { delete n[ device.id ]; } else { n[ device.id ] = Number( e.target.value ); } set( 'order', n ); } } ),
				h( 'p', { id: id + '-h', className: 'blf-help' }, 'A lower number comes first. Changing the order changes the reading order for screen readers only in some browsers, so keep it close to the source order.' ) ) );
	}

	/** Where an image comes from: the media library, the featured image, or a custom field (ACF or plain). */
	function ImageSourceField( { attrs, set } ) {
		const id = useUid();
		const source = attrs.source || 'static';
		const [ fields, setFields ] = useState( null );
		useEffect( () => {
			if ( source === 'static' || source === 'featured' || fields ) { return; }
			apiFetch( { path: API + '/fields' } ).then( setFields ).catch( () => setFields( { acf: [], meta: [], acfActive: false } ) );
		}, [ source ] );
		const listId = id + '-list';
		const dynamicField = source === 'field' || source === 'option';
		return h( Fragment, null,
			h( 'div', { className: 'blf' },
				h( 'label', { htmlFor: id }, 'Image source' ),
				h( 'select', { id, value: source, onChange: ( e ) => set( 'source', e.target.value ) },
					h( 'option', { value: 'static' }, 'Choose an image (media library)' ),
					h( 'option', { value: 'featured' }, 'Dynamic: featured image of this page' ),
					h( 'option', { value: 'field' }, 'Dynamic: custom field (ACF image field or any field)' ),
					h( 'option', { value: 'option' }, 'Dynamic: ACF options page field' ) ),
				h( 'p', { className: 'blf-help' }, source === 'static' ? 'A fixed picture.' : source === 'featured' ? 'Uses the featured image of the page that shows this element.' : 'Reads the picture from a field of the page that shows this element' + ( source === 'option' ? ', or from an ACF options page.' : '.' ) + ' The image below is the fallback.' ) ),
			dynamicField && h( 'div', { className: 'blf' },
				h( 'label', { htmlFor: id + '-f' }, 'Field name' ),
				h( 'input', { id: id + '-f', type: 'text', list: listId, value: attrs.field || '', placeholder: 'For example hero_image', 'aria-describedby': id + '-fh', onChange: ( e ) => set( 'field', e.target.value ) } ),
				h( 'datalist', { id: listId },
					( fields ? fields.acf : [] ).map( ( f ) => h( 'option', { key: 'a' + f.name, value: f.name }, f.label + ' (ACF, ' + f.group + ')' ) ),
					( fields && source === 'field' ? fields.meta : [] ).map( ( k ) => h( 'option', { key: 'm' + k, value: k } ) ) ),
				h( 'p', { id: id + '-fh', className: 'blf-help' },
					fields && fields.acfActive ? 'Pick an ACF image field or type a name. ' : 'ACF is not active, so plain custom fields are used. ',
					'The field may hold an image ID, an image address or an ACF image array.' ) ) );
	}

	/** Post types, terms and fields for the loop grid. Reloads when the post type changes. */
	function useLoopData( postType ) {
		const [ data, setData ] = useState( null );
		useEffect( () => {
			let live = true;
			apiFetch( { path: API + '/loop-sources?post_type=' + encodeURIComponent( postType || 'post' ) } )
				.then( ( r ) => live && setData( r ) )
				.catch( () => live && setData( { postTypes: [], taxonomies: [], terms: {}, fields: { core: [], acf: [], meta: [] }, acfActive: false } ) );
			return () => { live = false; };
		}, [ postType ] );
		return data;
	}

	/** Menus made in WordPress, for the navigation element. */
	function MenuSourceField( { attrs, set } ) {
		const id = useUid();
		const [ menus, setMenus ] = useState( null );
		useEffect( () => {
			let live = true;
			apiFetch( { path: API + '/menus' } ).then( ( r ) => live && setMenus( r ) ).catch( () => live && setMenus( { menus: [], navigations: [] } ) );
			return () => { live = false; };
		}, [] );
		const value = attrs.menu || '';
		const known = menus && menus.menus.concat( menus.navigations ).some( ( m ) => m.value === value );
		const count = menus ? menus.menus.length + menus.navigations.length : 0;
		return h( 'div', { className: 'blf' },
			h( 'label', { htmlFor: id }, 'Menu' ),
			h( 'select', { id, value, 'aria-describedby': id + '-h', onChange: ( e ) => set( 'menu', e.target.value ) },
				h( 'option', { value: '' }, 'Custom links (written here)' ),
				menus && menus.menus.length > 0 && h( 'optgroup', { label: 'WordPress menus' }, menus.menus.map( ( m ) => h( 'option', { key: m.value, value: m.value }, m.label ) ) ),
				menus && menus.navigations.length > 0 && h( 'optgroup', { label: 'Navigation of the block theme' }, menus.navigations.map( ( m ) => h( 'option', { key: m.value, value: m.value }, m.label ) ) ),
				menus && value && ! known && h( 'option', { value }, 'Menu not found (' + value + ')' ) ),
			h( 'p', { id: id + '-h', className: 'blf-help' },
				! menus ? 'Loading menus…' : count ? 'Pick a menu made in WordPress, or write your own links. Changes to the menu show up here and on the site. One level of submenu is shown.' : 'No menus were found in WordPress yet. Create one under Appearance, Menus, or write your own links.' ) );
	}

	/** What the loop lists: post type, and optionally one taxonomy with chosen terms. */
	function LoopSourceField( { attrs, set } ) {
		const id = useUid();
		const type = attrs.postType || 'post';
		const data = useLoopData( type );
		const taxes = data ? data.taxonomies : [];
		const terms = data && attrs.taxonomy ? ( data.terms[ attrs.taxonomy ] || [] ) : [];
		return h( Fragment, null,
			h( 'div', { className: 'blf' },
				h( 'label', { htmlFor: id }, 'What to list' ),
				h( 'select', { id, value: type, onChange: ( e ) => set( { postType: e.target.value, taxonomy: '', terms: '' } ) },
					( data && data.postTypes.length ? data.postTypes : [ { name: type, label: type } ] ).map( ( p ) => h( 'option', { key: p.name, value: p.name }, p.label ) ) ),
				h( 'p', { className: 'blf-help' }, 'Posts, pages or any public custom post type. The page that shows the list is never part of it.' ) ),
			taxes.length > 0 && h( 'div', { className: 'blf' },
				h( 'label', { htmlFor: id + '-t' }, 'Only items in' ),
				h( 'select', { id: id + '-t', value: attrs.taxonomy || '', onChange: ( e ) => set( { taxonomy: e.target.value, terms: '' } ) },
					h( 'option', { value: '' }, 'Everything' ),
					taxes.map( ( t ) => h( 'option', { key: t.name, value: t.name }, t.label ) ) ) ),
			attrs.taxonomy && h( 'div', { className: 'blf' },
				h( 'label', { htmlFor: id + '-s' }, 'Terms (slugs, separated by commas)' ),
				h( 'input', { id: id + '-s', type: 'text', list: id + '-sl', value: attrs.terms || '', placeholder: 'news, events', onChange: ( e ) => set( 'terms', e.target.value ) } ),
				h( 'datalist', { id: id + '-sl' }, terms.map( ( t ) => h( 'option', { key: t.slug, value: t.slug }, t.name ) ) ),
				h( 'p', { className: 'blf-help' }, 'Leave empty to show every term.' ) ) );
	}

	/** The card creator: an ordered list of fields. Lists built-in fields, ACF fields and custom fields. */
	function LoopCardField( { attrs, set, roles } ) {
		const data = useLoopData( attrs.postType || 'post' );
		const list = Array.isArray( attrs.card ) ? attrs.card : [];
		const options = [];
		if ( data ) {
			data.fields.core.forEach( ( f ) => options.push( { value: f.value, label: f.label } ) );
			data.fields.acf.forEach( ( f ) => options.push( { value: f.value, label: 'ACF: ' + f.label + ' (' + f.group + ')' } ) );
			data.fields.meta.forEach( ( f ) => options.push( { value: f.value, label: 'Custom field: ' + f.label } ) );
		}
		list.forEach( ( it ) => { if ( it.field && ! options.some( ( o ) => o.value === it.field ) ) { options.push( { value: it.field, label: it.field } ); } } );
		const field = { key: 'card', label: 'Card contents, top to bottom', type: 'items', itemLabel: 'Field', blank: { field: 'title', link: false, text: '' },
			fields: [
				{ key: 'field', label: 'Field', type: 'select', options },
				{ key: 'link', label: 'Link to the item', type: 'toggle' },
				{ key: 'text', label: 'Label or button text', type: 'text', help: 'Read more: the link text. Author and custom fields: a label shown before the value.' },
			] };
		return h( Fragment, null,
			h( Control, { field, attrs, set, roles } ),
			data && ! data.acfActive && h( 'p', { className: 'blf-help' }, 'ACF is not active, so only built-in and plain custom fields are listed.' ) );
	}

	/** Custom CSS for one element. "this" is the element itself. */
	function CustomCssField( { value, onChange } ) {
		const id = useUid();
		return h( 'div', { className: 'blf' },
			h( 'label', { htmlFor: id }, 'Custom CSS' ),
			h( 'textarea', { id, className: 'blf-code', rows: 8, spellCheck: false, autoCapitalize: 'off', autoComplete: 'off', value, 'aria-describedby': id + '-h',
				placeholder: 'this {\n  color: #b00020;\n}\nthis:hover {\n  opacity: .8;\n}', onChange: ( e ) => onChange( e.target.value ) } ),
			h( 'p', { id: id + '-h', className: 'blf-help' }, 'Write ', h( 'code', null, 'this' ), ' to point at this element. For example ', h( 'code', null, 'this:hover { color: red; }' ), ' or ', h( 'code', null, 'this p { margin: 0; }' ), '. Only this element is changed.' ) );
	}

	/* ---------- property forms ---------- */

	const T = ( key, label, help ) => ( { key, label, help, type: 'text' } );
	const A = ( key, label, help, rows ) => ( { key, label, help, type: 'textarea', rows: rows || 4 } );
	const S = ( key, label, options, help ) => ( { key, label, help, type: 'select', options } );
	const B = ( key, label, help ) => ( { key, label, help, type: 'toggle' } );
	const R = ( key, label, min, max ) => ( { key, label, type: 'range', min, max } );
	const C = ( key, label ) => ( { key, label, type: 'color' } );
	const L = ( key, label, fields, blank, itemLabel ) => ( { key, label, type: 'items', fields, blank, itemLabel } );
	const opts = ( arr ) => arr.map( ( v ) => ( { label: String( v ), value: String( v ) } ) );

	const UI = {
		'builderlab/container': [ S( 'tag', 'HTML element', opts( [ 'div', 'section', 'header', 'footer', 'main', 'aside', 'nav', 'article' ] ) ), T( 'label', 'Accessible name', 'Needed for nav. Useful for section and aside.' ),
			{ key: 'direction', label: 'Direction', type: 'devchoice', options: [ [ 'row', 'Row' ], [ 'column', 'Column' ], [ 'row-reverse', 'Row reversed' ], [ 'column-reverse', 'Column reversed' ] ], hint: 'Default: stack (column), or row if it was made a row.' },
			{ key: 'justify', label: 'Justify content', type: 'devchoice', options: [ [ 'start', 'Start' ], [ 'center', 'Center' ], [ 'end', 'End' ], [ 'between', 'Space between' ], [ 'around', 'Space around' ], [ 'evenly', 'Space evenly' ] ], hint: 'Along the direction: left to right in a row, top to bottom in a column.' },
			{ key: 'align', label: 'Align items', type: 'devchoice', options: [ [ 'start', 'Start' ], [ 'center', 'Center' ], [ 'end', 'End' ], [ 'stretch', 'Stretch' ] ], hint: 'Across the direction: top to bottom in a row, left to right in a column.' },
			{ key: 'wrap', label: 'Wrap', type: 'devchoice', options: [ [ 'wrap', 'Wrap' ], [ 'nowrap', 'No wrap' ] ], hint: 'Rows wrap by default.' },
			{ key: 'gap', label: 'Gap', type: 'gap' }, B( 'boxed', 'Limit the width' ), C( 'bg', 'Background color' ) ],
		'builderlab/heading': [ T( 'content', 'Text' ), S( 'level', 'Level', [ 1, 2, 3, 4, 5, 6 ].map( ( n ) => ( { label: 'H' + n, value: String( n ) } ) ) ), T( 'anchor', 'Anchor (optional)', 'Letters, numbers and hyphens. Lets links jump here.' ), C( 'fg', 'Text color' ), C( 'bg', 'Background color' ) ],
		'builderlab/text': [ A( 'content', 'Text', 'Basic inline HTML such as <strong> and <a> is allowed.', 6 ), C( 'fg', 'Text color' ), C( 'bg', 'Background color' ) ],
		'builderlab/button': [ T( 'content', 'Button text' ), S( 'kind', 'Element', [ { label: 'Link (goes to a page)', value: 'link' }, { label: 'Button (does an action)', value: 'button' } ] ), T( 'url', 'Link address' ), B( 'newTab', 'Open in a new tab', 'Screen readers are told that it opens in a new tab.' ),
			S( 'variant', 'Style', [ { label: 'Solid', value: 'solid' }, { label: 'Outline', value: 'outline' }, { label: 'Ghost (text only)', value: 'ghost' } ] ), S( 'size', 'Size', [ { label: 'Small', value: 'sm' }, { label: 'Medium', value: 'md' }, { label: 'Large', value: 'lg' } ] ), C( 'fg', 'Text color' ), C( 'bg', 'Background color' ) ],
		'builderlab/image': [ { key: 'source', label: 'Image source', type: 'imagesource' }, { key: 'url', label: 'Image', type: 'media' }, B( 'decorative', 'Decorative image (no meaning)', 'Screen readers skip it. Use for pure decoration only.' ), T( 'alt', 'Alt text (describe what the image shows)' ), T( 'caption', 'Caption' ) ],
		'builderlab/list': [ A( 'items', 'Items', 'One item per line.', 6 ), B( 'ordered', 'Numbered list' ) ],
		'builderlab/divider': [],
		'builderlab/quote': [ A( 'content', 'Quotation', '', 4 ), T( 'source', 'Source' ) ],
		'builderlab/table': [ T( 'caption', 'Caption (required)' ), B( 'headerRow', 'First row is a header row' ), B( 'rowHeaders', 'First column is a header column' ), A( 'data', 'Data', 'One row per line. Separate cells with the | character.', 8 ) ],
		'builderlab/alert': [ S( 'type', 'Type', [ { label: 'Information', value: 'info' }, { label: 'Success', value: 'success' }, { label: 'Warning', value: 'warning' }, { label: 'Error', value: 'error' } ] ), T( 'title', 'Title' ), A( 'content', 'Message', 'A blank line starts a new paragraph.', 4 ) ],
		'builderlab/html': [ A( 'html', 'HTML', 'Scripts, styles and frames are removed.', 10 ) ],
		'builderlab/accordion': [ L( 'items', 'Items', [ T( 'title', 'Title' ), A( 'content', 'Content', 'A blank line starts a new paragraph.', 3 ) ], { title: '', content: '' }, 'Item' ), B( 'exclusive', 'Only one open at a time' ), B( 'openFirst', 'First item open' ) ],
		'builderlab/tabs': [ T( 'label', 'Name of the tab group', 'Read out by screen readers.' ), S( 'level', 'Heading level of tab titles', [ 2, 3, 4, 5, 6 ].map( ( n ) => ( { label: 'H' + n, value: String( n ) } ) ) ),
			L( 'items', 'Tabs', [ T( 'title', 'Title' ), A( 'content', 'Content', '', 3 ) ], { title: '', content: '' }, 'Tab' ) ],
		'builderlab/nav': [ T( 'label', 'Name of this navigation (required)' ), { key: 'menu', label: 'Menu', type: 'menusource' },
			Object.assign( A( 'items', 'Links', 'One link per line: Label | address. Start a line with "- " for a submenu item.', 8 ), { showIf: ( a ) => ! a.menu } ) ],
		'builderlab/template': [ { key: 'templateId', label: 'Component', type: 'template' } ],
		'builderlab/loop': [ { key: 'postType', label: 'What to list', type: 'loopsource' },
			S( 'orderBy', 'Order by', [ { label: 'Date published', value: 'date' }, { label: 'Title', value: 'title' }, { label: 'Date modified', value: 'modified' }, { label: 'Menu order', value: 'menu_order' } ] ),
			S( 'order', 'Direction', [ { label: 'Newest or Z to A first', value: 'DESC' }, { label: 'Oldest or A to Z first', value: 'ASC' } ] ),
			S( 'perPage', 'Items per page', opts( [ 1, 2, 3, 4, 6, 8, 9, 12, 16, 24 ] ) ),
			S( 'columns', 'Columns on desktop', opts( [ 1, 2, 3, 4, 5, 6 ] ) ), S( 'columnsTablet', 'Columns on tablet', opts( [ 1, 2, 3, 4, 5, 6 ] ) ), S( 'columnsMobile', 'Columns on mobile', opts( [ 1, 2, 3, 4 ] ) ),
			S( 'pagination', 'Pagination', [ { label: 'Numbered pages', value: 'numbered' }, { label: 'Previous and next only', value: 'prevnext' }, { label: 'None (first items only)', value: 'none' } ] ),
			B( 'ajax', 'Load pages without reloading (AJAX)', 'The page stays where it is and only the list changes. Without scripts the links still work as normal links.' ),
			T( 'label', 'Name of the list (optional)', 'Read out by screen readers as a region name.' ),
			S( 'headingLevel', 'Heading level of card titles', [ 2, 3, 4, 5, 6 ].map( ( n ) => ( { label: 'H' + n, value: String( n ) } ) ) ),
			{ key: 'card', label: 'Card contents', type: 'loopcard' }, T( 'empty', 'Message when nothing is found' ) ],
		'builderlab/breadcrumbs': [ T( 'label', 'Name of the landmark' ), T( 'home', 'Label of the first link' ) ],
		'builderlab/search': [ T( 'label', 'Label (required)' ), T( 'buttonText', 'Button text' ), T( 'placeholder', 'Example text (optional)' ) ],
		'builderlab/form': [ L( 'fields', 'Form fields', [ S( 'type', 'Type', opts( [ 'text', 'email', 'tel', 'textarea', 'select', 'checkbox', 'radio' ] ) ), T( 'label', 'Label (required)' ), B( 'required', 'Required' ),
			T( 'help', 'Hint (optional)' ), S( 'autocomplete', 'Autocomplete', [ '', 'name', 'given-name', 'family-name', 'email', 'tel', 'street-address', 'postal-code', 'organization', 'off' ].map( ( v ) => ( { label: v || 'None / automatic', value: v } ) ) ), T( 'options', 'Options (select and radio)', 'Separate with commas.' ) ],
			{ type: 'text', label: '', required: false, options: '', autocomplete: '', help: '' }, 'Field' ), T( 'submitLabel', 'Submit button text' ), T( 'successMessage', 'Message after sending' ), T( 'recipient', 'Send entries to (email)', 'Empty uses the site admin email. Entries are also saved in the dashboard.' ) ],
	};

	const FIRST_CONTENT = {
		'builderlab/heading': { content: 'New heading', level: 2 }, 'builderlab/text': { content: 'Write your text here.' }, 'builderlab/button': { content: 'Button text', url: '#' },
		'builderlab/list': { items: 'First item\nSecond item\nThird item' }, 'builderlab/quote': { content: 'A quotation.' },
		'builderlab/table': { caption: 'Table caption', rowHeaders: true, data: 'Column one | Column two\nCell | Cell\nCell | Cell' },
		'builderlab/alert': { type: 'info', title: 'Title', content: 'Message.' },
		'builderlab/accordion': { items: [ { title: 'First item', content: 'Content.' }, { title: 'Second item', content: 'Content.' } ] },
		'builderlab/tabs': { label: 'Tabbed content', items: [ { title: 'First tab', content: 'Content.' }, { title: 'Second tab', content: 'Content.' } ] },
		'builderlab/nav': { label: 'Main', items: 'Home | /\nAbout | /about/' },
		'builderlab/search': { label: 'Search this site' },
		'builderlab/form': { submitLabel: 'Send', fields: [ { type: 'text', label: 'Name', required: true, autocomplete: 'name', options: '', help: '' }, { type: 'email', label: 'Email address', required: true, autocomplete: 'email', options: '', help: '' }, { type: 'textarea', label: 'Message', required: true, autocomplete: '', options: '', help: '' } ] },
	};

	function makeNode( blockDef ) {
		const attrs = {};
		Object.keys( blockDef.attributes ).forEach( ( k ) => {
			const d = blockDef.attributes[ k ].default;
			if ( d !== null && d !== undefined && d !== '' && ! ( Array.isArray( d ) && ! d.length ) ) { attrs[ k ] = d; }
		} );
		Object.assign( attrs, clone( FIRST_CONTENT[ blockDef.name ] || {} ) );
		if ( blockDef.name === 'builderlab/loop' ) { attrs.loopKey = 'l' + Math.random().toString( 36 ).slice( 2, 8 ); }
		if ( blockDef.name === 'builderlab/form' ) { attrs.formKey = 'f' + Math.random().toString( 36 ).slice( 2, 10 ); }
		return { id: newId(), name: blockDef.name, attrs, children: [] };
	}

	let uidCount = 0;
	const useUid = () => useMemo( () => 'blf-' + ++uidCount, [] );

	function ColorField( { field, value, onChange, roles } ) {
		const id = useUid();
		const custom = HEX6.test( value || '' );
		return h( 'div', { className: 'blf' },
			h( 'label', { htmlFor: id }, field.label ),
			h( 'select', { id, value: custom ? '__custom' : value || '', onChange: ( e ) => onChange( e.target.value === '__custom' ? ( roles.text || '#000000' ) : e.target.value ) },
				h( 'option', { value: '' }, 'Default for this block' ),
				Object.keys( roles ).map( ( r ) => h( 'option', { key: r, value: r }, r + ' (' + roles[ r ] + ')' ) ),
				h( 'option', { value: '__custom' }, 'Custom color' ) ),
			custom && h( 'input', { type: 'color', 'aria-label': field.label + ', custom color', value, onChange: ( e ) => onChange( e.target.value ) } ) );
	}

	function Control( { field, attrs, set, roles } ) {
		const id = useUid();
		const v = attrs[ field.key ];
		const common = { id, 'aria-describedby': field.help ? id + '-h' : undefined };
		const help = field.help ? h( 'p', { id: id + '-h', className: 'blf-help' }, field.help ) : null;
		if ( field.type === 'color' ) { return h( ColorField, { field, value: v || '', onChange: ( x ) => set( field.key, x ), roles } ); }
		if ( field.type === 'gap' ) { return h( GapField, { attrs, set } ); }
		if ( field.type === 'template' ) {
			return h( 'div', { className: 'blf' }, h( 'label', { htmlFor: id }, field.label ),
				h( 'select', Object.assign( {}, common, { value: String( attrs.templateId || '' ), onChange: ( e ) => set( 'templateId', Number( e.target.value ) || 0 ) } ),
					h( 'option', { value: '' }, 'Choose a component…' ),
					COMPONENTS.map( ( c ) => h( 'option', { key: c.id, value: String( c.id ) }, c.title ) ) ),
				h( 'p', { id: id + '-h', className: 'blf-help' }, COMPONENTS.length ? 'Fields inside the component, such as dynamic images, use the page that shows it. Only published components are shown on the site.' : 'There are no components yet. Add one in BuilderLab, Templates, with the type Component.' ) );
		}
		if ( field.type === 'imagesource' ) { return h( ImageSourceField, { attrs, set } ); }
		if ( field.type === 'menusource' ) { return h( MenuSourceField, { attrs, set } ); }
		if ( field.type === 'loopsource' ) { return h( LoopSourceField, { attrs, set } ); }
		if ( field.type === 'loopcard' ) { return h( LoopCardField, { attrs, set, roles } ); }
		if ( field.type === 'devchoice' ) {
			return h( DeviceChoice, { label: field.label, keyName: field.key, value: v, device: field.device, set, options: field.options, hint: field.hint } );
		}
		if ( field.type === 'toggle' ) {
			return h( 'div', { className: 'blf blf-check' }, h( 'label', null, h( 'input', Object.assign( {}, common, { type: 'checkbox', checked: !! v, onChange: ( e ) => set( field.key, e.target.checked ) } ) ), ' ' + field.label ), help );
		}
		if ( field.type === 'select' ) {
			return h( 'div', { className: 'blf' }, h( 'label', { htmlFor: id }, field.label ),
				h( 'select', Object.assign( {}, common, { value: v === undefined || v === null ? '' : String( v ), onChange: ( e ) => set( field.key, /^\d+$/.test( e.target.value ) && field.key === 'level' ? Number( e.target.value ) : e.target.value ) } ),
					field.options.map( ( o ) => h( 'option', { key: o.value, value: o.value }, o.label ) ) ), help );
		}
		if ( field.type === 'range' ) {
			return h( 'div', { className: 'blf' }, h( 'label', { htmlFor: id }, field.label + ': ' + ( v === undefined ? 3 : v ) ),
				h( 'input', Object.assign( {}, common, { type: 'range', min: field.min, max: field.max, value: v === undefined ? 3 : v, onChange: ( e ) => set( field.key, Number( e.target.value ) ) } ) ) );
		}
		if ( field.type === 'textarea' ) {
			return h( 'div', { className: 'blf' }, h( 'label', { htmlFor: id }, field.label ), h( 'textarea', Object.assign( {}, common, { rows: field.rows, value: v || '', onChange: ( e ) => set( field.key, e.target.value ) } ) ), help );
		}
		if ( field.type === 'media' ) {
			const pick = () => {
				if ( ! wp.media ) { return; }
				const frame = wp.media( { title: 'Choose an image', multiple: false, library: { type: 'image' } } );
				frame.on( 'select', () => {
					const a = frame.state().get( 'selection' ).first().toJSON();
					set( { url: a.url, id: a.id, alt: attrs.alt || a.alt || '' } );
				} );
				frame.open();
			};
			return h( 'div', { className: 'blf' }, h( 'label', { htmlFor: id }, attrs.source && attrs.source !== 'static' ? 'Fallback image address (used when the field is empty)' : 'Image address' ),
				h( 'input', Object.assign( {}, common, { type: 'text', value: v || '', onChange: ( e ) => set( 'url', e.target.value ) } ) ),
				wp.media && h( 'button', { type: 'button', className: 'blb', onClick: pick }, 'Choose from the media library' ),
				v && h( 'img', { className: 'blf-thumb', src: v, alt: '' } ) );
		}
		if ( field.type === 'items' ) {
			const list = Array.isArray( v ) ? v : [];
			const upd = ( i, patch ) => set( field.key, list.map( ( it, n ) => ( n === i ? Object.assign( {}, it, patch ) : it ) ) );
			const swap = ( i, j ) => { if ( j < 0 || j >= list.length ) { return; } const c = list.slice(); [ c[ i ], c[ j ] ] = [ c[ j ], c[ i ] ]; set( field.key, c ); };
			return h( 'fieldset', { className: 'blf-items' }, h( 'legend', null, field.label ),
				list.map( ( it, i ) => h( 'fieldset', { key: i, className: 'blf-item' }, h( 'legend', null, `${ field.itemLabel } ${ i + 1 }` ),
					field.fields.map( ( sub ) => h( Control, { key: sub.key, field: sub, attrs: it, roles, set: ( k, val ) => upd( i, { [ k ]: val } ) } ) ),
					h( 'div', { className: 'blf-row' },
						h( 'button', { type: 'button', className: 'blb', disabled: i === 0, onClick: () => swap( i, i - 1 ) }, `Move ${ field.itemLabel.toLowerCase() } ${ i + 1 } up` ),
						h( 'button', { type: 'button', className: 'blb', disabled: i === list.length - 1, onClick: () => swap( i, i + 1 ) }, `Move ${ field.itemLabel.toLowerCase() } ${ i + 1 } down` ),
						h( 'button', { type: 'button', className: 'blb blb-danger', onClick: () => set( field.key, list.filter( ( _, n ) => n !== i ) ) }, `Remove ${ field.itemLabel.toLowerCase() } ${ i + 1 }` ) ) ) ),
				h( 'button', { type: 'button', className: 'blb', onClick: () => set( field.key, list.concat( [ Object.assign( {}, field.blank ) ] ) ) }, 'Add ' + field.itemLabel.toLowerCase() ) );
		}
		return h( 'div', { className: 'blf' }, h( 'label', { htmlFor: id }, field.label ), h( 'input', Object.assign( {}, common, { type: 'text', value: v === undefined || v === null ? '' : v, onChange: ( e ) => set( field.key, e.target.value ) } ) ), help );
	}

	/* ---------- layout controls: width and visibility per device ---------- */

	const DEVICES = [
		{ id: 'desktop', label: 'Desktop', icon: 'dashicons-desktop', width: null, note: 'Desktop: wider than 1024 px' },
		{ id: 'tablet', label: 'Tablet', icon: 'dashicons-tablet', width: 768, note: 'Tablet: up to 1024 px' },
		{ id: 'mobile', label: 'Mobile', icon: 'dashicons-smartphone', width: 375, note: 'Mobile: up to 767 px' },
	];
	const WIDTH_PRESETS = [ [ '', 'Default' ], [ 'auto', 'Auto' ], [ '25%', '25%' ], [ '33.33%', '33%' ], [ '50%', '50%' ], [ '66.66%', '66%' ], [ '75%', '75%' ], [ '100%', 'Full (100%)' ] ];

	function WidthField( { attrs, device, set } ) {
		const id = useUid();
		const w = attrs.width || {};
		const val = w[ device.id ] || '';
		const inherited = device.id === 'tablet' ? w.desktop : device.id === 'mobile' ? w.tablet || w.desktop : '';
		const isPreset = WIDTH_PRESETS.some( ( p ) => p[ 0 ] === val );
		const [ custom, setCustom ] = useState( ! isPreset );
		const write = ( v ) => {
			const next = Object.assign( {}, w );
			if ( v ) { next[ device.id ] = v; } else { delete next[ device.id ]; }
			set( 'width', next );
		};
		return h( 'div', { className: 'blf' },
			h( 'label', { htmlFor: id }, h( 'span', { className: 'dashicons ' + device.icon, 'aria-hidden': 'true' } ), ' Width on ' + device.label.toLowerCase() ),
			h( 'select', { id, value: custom || ! isPreset ? '__custom' : val, onChange: ( e ) => {
				if ( e.target.value === '__custom' ) { setCustom( true ); } else { setCustom( false ); write( e.target.value ); }
			} }, WIDTH_PRESETS.map( ( p ) => h( 'option', { key: p[ 0 ], value: p[ 0 ] }, p[ 1 ] ) ), h( 'option', { value: '__custom' }, 'Custom…' ) ),
			( custom || ! isPreset ) && h( SizeInput, { label: 'Custom width on ' + device.label.toLowerCase(), value: val === 'auto' ? '' : val, onChange: ( v ) => write( v ), help: 'px, rem, em, %, vw or vh.' } ),
			h( 'p', { className: 'blf-help' }, inherited && ! val ? `Follows ${ device.id === 'mobile' && ! w.tablet ? 'desktop' : device.id === 'mobile' ? 'tablet' : 'desktop' }: ${ inherited }.` : 'Use a number with a unit. A bare number is read as px. In a row, percentages already allow for the gap.' ) );
	}
	function HideField( { attrs, set } ) {
		const hide = attrs.hide || {};
		return h( 'fieldset', { className: 'blf-items' }, h( 'legend', null, 'Hide on' ),
			DEVICES.map( ( d ) => h( 'div', { key: d.id, className: 'blf blf-check' }, h( 'label', null,
				h( 'input', { type: 'checkbox', checked: !! hide[ d.id ], onChange: ( e ) => { const n = Object.assign( {}, hide ); if ( e.target.checked ) { n[ d.id ] = true; } else { delete n[ d.id ]; } set( 'hide', n ); } } ),
				' ' + d.label ) ) ),
			h( 'p', { className: 'blf-help' }, 'Hidden elements are removed for everyone, including screen reader users. In the editor they are shown dimmed.' ) );
	}

	const LAYOUT_KEYS = [ 'layout', 'boxed', 'gap', 'direction', 'justify', 'align', 'wrap' ];
	const STYLE_KEYS = [ 'variant', 'size' ];
	const groupOf = ( f ) => ( f.type === 'color' || STYLE_KEYS.includes( f.key ) ? 'style' : LAYOUT_KEYS.includes( f.key ) ? 'layout' : 'content' );

	/* ---------- template settings ---------- */

	const RULES = [
		[ 'site', 'Entire site' ], [ 'front_page', 'Front page' ], [ 'blog', 'Posts page (blog)' ], [ 'singular', 'Single content' ], [ 'archive', 'Archives' ],
		[ 'search', 'Search results' ], [ 'not_found', '404 page' ], [ 'logged_in', 'Logged-in users' ], [ 'logged_out', 'Logged-out visitors' ], [ 'role', 'User role' ],
	];

	function TemplatePanel( { tpl, setTpl, options, postId } ) {
		const [ pageId, setPageId ] = useState( '' );
		const [ result, setResult ] = useState( null );
		const upd = ( i, patch ) => setTpl( Object.assign( {}, tpl, { conditions: tpl.conditions.map( ( c, n ) => ( n === i ? Object.assign( {}, c, patch ) : c ) ) } ) );
		const idsLabel = ( c ) => ( c.rule === 'archive' ? 'Only these term IDs (optional)' : 'Only these IDs (optional)' );
		const isLocation = tpl.type === 'header' || tpl.type === 'footer';
		const test = () => {
			setResult( { loading: true } );
			apiFetch( { path: '/builderlab/v1/templates/resolve?post=' + encodeURIComponent( pageId ) } )
				.then( ( r ) => setResult( r ) )
				.catch( ( e ) => setResult( { error: ( e && e.message ) || 'Could not check.' } ) );
		};
		return h( 'div', { className: 'bla-pane' },
			h( 'h2', { className: 'bla-h' }, 'Template settings' ),
			h( 'div', { className: 'blf' }, h( 'label', { htmlFor: 'bl-tpl-type' }, 'Template type' ),
				h( 'select', { id: 'bl-tpl-type', value: tpl.type, onChange: ( e ) => setTpl( Object.assign( {}, tpl, { type: e.target.value } ) ) },
					Object.keys( tpl.types ).map( ( k ) => h( 'option', { key: k, value: k }, tpl.types[ k ] ) ) ),
				h( 'p', { className: 'blf-help' }, tpl.type === 'component' ? 'Insert it in any page with the Template element. No display conditions needed.' : 'Replaces the theme\'s own ' + tpl.type + ' where the conditions below match.' ) ),
			isLocation && h( Fragment, null,
				h( 'fieldset', { className: 'blf-items' }, h( 'legend', null, 'Display conditions' ),
					tpl.conditions.length === 0 && h( 'p', { className: 'blf-help' }, 'No conditions yet, so this template is not used anywhere.' ),
					tpl.conditions.map( ( c, i ) => h( 'fieldset', { key: i, className: 'blf-item' }, h( 'legend', null, 'Condition ' + ( i + 1 ) ),
						h( 'div', { className: 'blf' }, h( 'label', { htmlFor: 'bl-c-m' + i }, 'Action' ),
							h( 'select', { id: 'bl-c-m' + i, value: c.mode, onChange: ( e ) => upd( i, { mode: e.target.value } ) }, h( 'option', { value: 'include' }, 'Show on' ), h( 'option', { value: 'exclude' }, 'Do not show on' ) ) ),
						h( 'div', { className: 'blf' }, h( 'label', { htmlFor: 'bl-c-r' + i }, 'Where' ),
							h( 'select', { id: 'bl-c-r' + i, value: c.rule, onChange: ( e ) => upd( i, { rule: e.target.value, subtype: '', value: '' } ) }, RULES.map( ( r ) => h( 'option', { key: r[ 0 ], value: r[ 0 ] }, r[ 1 ] ) ) ) ),
						c.rule === 'singular' && h( 'div', { className: 'blf' }, h( 'label', { htmlFor: 'bl-c-s' + i }, 'Content type' ),
							h( 'select', { id: 'bl-c-s' + i, value: c.subtype || 'all', onChange: ( e ) => upd( i, { subtype: e.target.value } ) }, h( 'option', { value: 'all' }, 'All content' ), options.postTypes.map( ( p ) => h( 'option', { key: p.name, value: p.name }, p.label ) ) ) ),
						c.rule === 'archive' && h( 'div', { className: 'blf' }, h( 'label', { htmlFor: 'bl-c-s' + i }, 'Archive of' ),
							h( 'select', { id: 'bl-c-s' + i, value: c.subtype || 'all', onChange: ( e ) => upd( i, { subtype: e.target.value } ) }, h( 'option', { value: 'all' }, 'All archives' ),
								options.postTypes.map( ( p ) => h( 'option', { key: 'p' + p.name, value: p.name }, p.label + ' archive' ) ), options.taxonomies.map( ( t ) => h( 'option', { key: 't' + t.name, value: t.name }, t.label ) ) ) ),
						( c.rule === 'singular' || c.rule === 'archive' ) && h( 'div', { className: 'blf' }, h( 'label', { htmlFor: 'bl-c-v' + i }, idsLabel( c ) ),
							h( 'input', { id: 'bl-c-v' + i, type: 'text', value: c.value || '', placeholder: 'For example 12, 34', onChange: ( e ) => upd( i, { value: e.target.value } ) } ) ),
						c.rule === 'role' && h( 'div', { className: 'blf' }, h( 'label', { htmlFor: 'bl-c-v' + i }, 'Role' ),
							h( 'select', { id: 'bl-c-v' + i, value: c.value || '', onChange: ( e ) => upd( i, { value: e.target.value } ) }, h( 'option', { value: '' }, 'Choose a role…' ), options.roles.map( ( r ) => h( 'option', { key: r.name, value: r.name }, r.label ) ) ) ),
						h( 'button', { type: 'button', className: 'blb blb-danger', onClick: () => setTpl( Object.assign( {}, tpl, { conditions: tpl.conditions.filter( ( _, n ) => n !== i ) } ) ) }, 'Remove condition ' + ( i + 1 ) ) ) ),
					h( 'button', { type: 'button', className: 'blb', onClick: () => setTpl( Object.assign( {}, tpl, { conditions: tpl.conditions.concat( [ { mode: 'include', rule: 'site', subtype: '', value: '' } ] ) } ) ) }, 'Add condition' ) ),
				h( 'div', { className: 'blf' }, h( 'label', { htmlFor: 'bl-tpl-prio' }, 'Priority' ),
					h( 'input', { id: 'bl-tpl-prio', type: 'number', min: 0, max: 999, value: tpl.priority, onChange: ( e ) => setTpl( Object.assign( {}, tpl, { priority: Number( e.target.value ) } ) ) } ),
					h( 'p', { className: 'blf-help' }, 'When two templates match with the same specificity, the higher number wins. A more specific condition (one page) always beats a broader one (the whole site).' ) ),
				h( 'fieldset', { className: 'blf-items' }, h( 'legend', null, 'Check a page' ),
					h( 'div', { className: 'blf' }, h( 'label', { htmlFor: 'bl-tpl-page' }, 'Page or post ID' ), h( 'input', { id: 'bl-tpl-page', type: 'text', inputMode: 'numeric', value: pageId, onChange: ( e ) => setPageId( e.target.value.replace( /\D/g, '' ) ) } ) ),
					h( 'button', { type: 'button', className: 'blb', disabled: ! pageId, onClick: test }, 'Which header and footer apply?' ),
					h( 'p', { role: 'status', className: 'blf-help' }, ! result ? 'Saved templates only. Save first to include your latest changes.' : result.loading ? 'Checking…' : result.error ? result.error
						: `"${ result.page }": header ${ result.header ? result.header.title : 'from the theme' }; footer ${ result.footer ? result.footer.title : 'from the theme' }.` ) ) ) );
	}

	/* ---------- resizable side panels ---------- */

	const PANEL_MIN = 240;
	const PANEL_DEFAULT = 304;
	const panelMax = () => Math.max( PANEL_MIN, Math.floor( window.innerWidth * 0.3 ) ); // at most 30% of the window
	const clampPanel = ( w ) => Math.max( PANEL_MIN, Math.min( panelMax(), Math.round( w ) ) );

	/** A draggable edge. Also works with the arrow keys, Home, End and a double click to reset. */
	function Resizer( { side, width, onChange, onActive, label } ) {
		const down = ( e ) => {
			e.preventDefault();
			const el = e.currentTarget;
			const startX = e.clientX;
			const start = width;
			el.setPointerCapture( e.pointerId );
			onActive( true );
			const move = ( ev ) => { const dx = ev.clientX - startX; onChange( clampPanel( side === 'left' ? start + dx : start - dx ) ); };
			const up = () => {
				el.removeEventListener( 'pointermove', move );
				el.removeEventListener( 'pointerup', up );
				el.removeEventListener( 'pointercancel', up );
				onActive( false );
			};
			el.addEventListener( 'pointermove', move );
			el.addEventListener( 'pointerup', up );
			el.addEventListener( 'pointercancel', up );
		};
		const key = ( e ) => {
			const grow = side === 'left' ? 'ArrowRight' : 'ArrowLeft';
			const shrink = side === 'left' ? 'ArrowLeft' : 'ArrowRight';
			if ( e.key === grow ) { e.preventDefault(); onChange( clampPanel( width + ( e.shiftKey ? 48 : 16 ) ) ); }
			else if ( e.key === shrink ) { e.preventDefault(); onChange( clampPanel( width - ( e.shiftKey ? 48 : 16 ) ) ); }
			else if ( e.key === 'Home' ) { e.preventDefault(); onChange( PANEL_MIN ); }
			else if ( e.key === 'End' ) { e.preventDefault(); onChange( panelMax() ); }
		};
		return h( 'div', { role: 'separator', 'aria-orientation': 'vertical', tabIndex: 0, className: 'bla-resize bla-resize--' + side,
			'aria-label': label, 'aria-valuemin': PANEL_MIN, 'aria-valuemax': panelMax(), 'aria-valuenow': width, title: 'Drag to resize. Double-click to reset.',
			onPointerDown: down, onKeyDown: key, onDoubleClick: () => onChange( PANEL_DEFAULT ) } );
	}

	/* ---------- context menu ---------- */

	function ContextMenu( { menu, groups, onPick, onClose, label } ) {
		const ref = useRef( null );
		const [ pos, setPos ] = useState( { x: menu.x, y: menu.y } );
		useEffect( () => {
			const el = ref.current;
			if ( ! el ) { return undefined; }
			const r = el.getBoundingClientRect();
			setPos( { x: Math.max( 8, Math.min( menu.x, window.innerWidth - r.width - 8 ) ), y: Math.max( 8, Math.min( menu.y, window.innerHeight - r.height - 8 ) ) } );
			const first = el.querySelector( 'button:not(:disabled)' );
			first && first.focus();
			const away = ( e ) => { if ( ! el.contains( e.target ) ) { onClose( false ); } };
			window.addEventListener( 'mousedown', away, true );
			window.addEventListener( 'resize', () => onClose( false ) );
			return () => window.removeEventListener( 'mousedown', away, true );
		}, [] );
		const keys = ( e ) => {
			const items = [ ...ref.current.querySelectorAll( 'button:not(:disabled)' ) ];
			const i = items.indexOf( document.activeElement );
			if ( e.key === 'ArrowDown' ) { e.preventDefault(); items[ ( i + 1 ) % items.length ].focus(); }
			else if ( e.key === 'ArrowUp' ) { e.preventDefault(); items[ ( i - 1 + items.length ) % items.length ].focus(); }
			else if ( e.key === 'Home' ) { e.preventDefault(); items[ 0 ].focus(); }
			else if ( e.key === 'End' ) { e.preventDefault(); items[ items.length - 1 ].focus(); }
			else if ( e.key === 'Escape' || e.key === 'Tab' ) { e.preventDefault(); onClose( true ); }
		};
		return h( 'div', { ref, className: 'blm', role: 'menu', 'aria-label': label, style: { left: pos.x, top: pos.y }, onKeyDown: keys },
			groups.map( ( g, gi ) => h( 'div', { key: gi, className: 'blm-group', role: 'group' },
				g.map( ( it ) => h( 'button', { key: it.id, type: 'button', role: 'menuitem', className: 'blm-item' + ( it.danger ? ' is-danger' : '' ), disabled: it.disabled, onClick: () => onPick( it.id ) },
					h( 'span', null, it.label ), it.hint ? h( 'span', { className: 'blm-hint' }, it.hint ) : null ) ) ) ) );
	}

	/* ---------- app ---------- */

	function App() {
		const [ data, setData ] = useState( null );
		const [ error, setError ] = useState( '' );
		const [ doc, setDoc ] = useState( { tree: [], past: [], future: [] } );
		const [ saved, setSaved ] = useState( '[]' );
		const [ title, setTitle ] = useState( '' );
		const [ savedTitle, setSavedTitle ] = useState( '' );
		const [ status, setStatus ] = useState( 'draft' );
		const [ loadedAt, setLoadedAt ] = useState( '' );
		const [ sel, setSel ] = useState( null );
		const [ leftTab, setLeftTab ] = useState( 'elements' );
		const [ propTab, setPropTab ] = useState( 'content' );
		const [ rightTab, setRightTab ] = useState( 'layers' );
		const [ device, setDevice ] = useState( 'desktop' );
		const [ theme, setTheme ] = useState( () => { try { return window.localStorage.getItem( 'builderlabTheme' ) || 'dark'; } catch ( e ) { return 'dark'; } } );
		const [ filter, setFilter ] = useState( '' );
		const [ html, setHtml ] = useState( null );
		const [ layout, setLayout ] = useState( '' );
		const [ savedLayout, setSavedLayout ] = useState( '' );
		const [ rendering, setRendering ] = useState( false );
		const [ msg, setMsg ] = useState( '' );
		const [ announce, setAnnounce ] = useState( '' );
		const [ saving, setSaving ] = useState( false );
		const [ frameTick, setFrameTick ] = useState( 0 );
		const [ conflict, setConflict ] = useState( false );
		const [ drop, setDrop ] = useState( null );
		const [ collapsed, setCollapsed ] = useState( {} );
		const [ menu, setMenu ] = useState( null );
		const [ panels, setPanels ] = useState( () => {
			try {
				const p = JSON.parse( window.localStorage.getItem( 'builderlabPanels' ) || '{}' );
				return { left: clampPanel( p.left || PANEL_DEFAULT ), right: clampPanel( p.right || PANEL_DEFAULT ) };
			} catch ( e ) { return { left: PANEL_DEFAULT, right: PANEL_DEFAULT }; }
		} );
		const [ resizing, setResizing ] = useState( false );
		const [ tpl, setTpl ] = useState( null );
		const [ savedTpl, setSavedTpl ] = useState( '' );
		const [ clip, setClip ] = useState( null );
		const frame = useRef( null );
		const lastEdit = useRef( { key: '', t: 0 } );
		const api = useRef( {} );

		const tree = doc.tree;
		const dev = DEVICES.find( ( d ) => d.id === device );

		useEffect( () => {
			apiFetch( { path: API } )
				.then( ( d ) => {
					setData( d );
					setDoc( { tree: d.tree, past: [], future: [] } );
					setSaved( JSON.stringify( d.tree ) );
					setTitle( d.post.title );
					setSavedTitle( d.post.title );
					setStatus( d.post.status );
					setLoadedAt( d.post.modified );
					COMPONENTS = d.components || [];
					setLayout( d.layout || '' );
					setSavedLayout( d.layout || '' );
					if ( d.template ) { setTpl( d.template ); setSavedTpl( JSON.stringify( [ d.template.type, d.template.conditions, d.template.priority ] ) ); setLeftTab( 'template' ); }
					if ( d.imported ) { setMsg( 'This page had content that was not built with BuilderLab. It was kept as an HTML block.' ); }
				} )
				.catch( ( e ) => setError( ( e && e.message ) || 'Could not load this page.' ) );
		}, [] );

		const blocks = data ? data.blocks : [];
		const roles = data ? data.roles : {};
		const byName = useMemo( () => { const m = {}; blocks.forEach( ( b ) => ( m[ b.name ] = b ) ); return m; }, [ blocks ] );
		const titleOf = useCallback( ( n ) => ( n.opaque ? n.title || n.name : ( byName[ n.name ] ? byName[ n.name ].title : n.name ) ), [ byName ] );
		const issues = useMemo( () => checkTree( tree, roles, titleOf ), [ tree, roles, titleOf ] );
		const errorCount = issues.filter( ( i ) => i.severity === 'error' ).length;
		const tplKey = tpl ? JSON.stringify( [ tpl.type, tpl.conditions, tpl.priority ] ) : '';
		const dirty = JSON.stringify( tree ) !== saved || title !== savedTitle || ( tpl && tplKey !== savedTpl ) || layout !== savedLayout;
		const selected = sel ? find( tree, sel ) : null;

		const commit = ( fn, key ) => setDoc( ( d ) => {
			const t = fn( d.tree );
			if ( t === d.tree ) { return d; }
			const now = Date.now();
			const merge = key && lastEdit.current.key === key && now - lastEdit.current.t < 1000;
			lastEdit.current = { key: key || '', t: now };
			return { tree: t, past: merge ? d.past : d.past.concat( [ d.tree ] ).slice( -60 ), future: [] };
		} );
		const undo = () => setDoc( ( d ) => ( d.past.length ? { tree: d.past[ d.past.length - 1 ], past: d.past.slice( 0, -1 ), future: [ d.tree ].concat( d.future ) } : d ) );
		const redo = () => setDoc( ( d ) => ( d.future.length ? { tree: d.future[ 0 ], past: d.past.concat( [ d.tree ] ), future: d.future.slice( 1 ) } : d ) );
		const say = ( t ) => setAnnounce( t );
		const editing = useRef( false );

		/** Edit text directly on the page (double-click, or the button in the properties). */
		const startEdit = ( id ) => {
			const f2 = frame.current;
			const d = f2 && f2.contentDocument;
			const node = find( doc.tree, id );
			if ( ! d || ! node || node.node.opaque || editing.current ) { return; }
			const c = EDITABLE[ node.node.name ];
			const host = d.querySelector( '[data-bl-id="' + id + '"]' );
			if ( ! c || ! host ) { return; }
			const el = c.selector ? host.querySelector( c.selector ) : host;
			if ( ! el ) { return; }
			const original = ( node.node.attrs || {} )[ c.key ] || '';
			editing.current = true;
			el.innerHTML = c.rich ? original : escapeHtml( original );
			el.setAttribute( 'contenteditable', 'true' );
			el.setAttribute( 'spellcheck', 'true' );
			el.style.outline = '2px solid #000';
			el.style.outlineOffset = '2px';
			el.style.cursor = 'text';
			el.focus();
			const sel = d.defaultView.getSelection();
			const range = d.createRange();
			range.selectNodeContents( el );
			range.collapse( false );
			sel.removeAllRanges();
			sel.addRange( range );
			say( 'Editing text on the page. Press Escape or click outside to finish.' );
			let done = false;
			const finish = () => {
				if ( done ) { return; }
				done = true;
				el.removeEventListener( 'keydown', onKey );
				el.removeEventListener( 'blur', finish );
				el.removeEventListener( 'paste', onPaste );
				el.removeAttribute( 'contenteditable' );
				const next = c.rich ? cleanInline( el.innerHTML ) : el.textContent.replace( /\s+/g, ' ' ).trim();
				editing.current = false;
				if ( next !== original ) {
					commit( ( t ) => mapNodes( t, ( n ) => ( n.id === id ? Object.assign( {}, n, { attrs: Object.assign( {}, n.attrs, { [ c.key ]: next } ) } ) : n ) ), id + ':' + c.key );
					say( 'Text updated.' );
				} else {
					setHtml( ( h2 ) => ( h2 === null ? h2 : h2 + ' ' ) ); // put the rendered version back
				}
			};
			const onKey = ( e ) => {
				if ( e.key === 'Escape' ) { e.preventDefault(); finish(); return; }
				if ( e.key === 'Enter' ) {
					e.preventDefault();
					if ( c.single ) { finish(); } else { d.execCommand( 'insertLineBreak' ); }
					return;
				}
				if ( c.rich && ( e.ctrlKey || e.metaKey ) && ! e.shiftKey ) {
					if ( e.key.toLowerCase() === 'b' ) { e.preventDefault(); d.execCommand( 'bold' ); }
					if ( e.key.toLowerCase() === 'i' ) { e.preventDefault(); d.execCommand( 'italic' ); }
				}
			};
			const onPaste = ( e ) => { e.preventDefault(); const t = ( e.clipboardData || window.clipboardData ).getData( 'text/plain' ).replace( /\r?\n/g, c.single ? ' ' : '\n' ); d.execCommand( 'insertText', false, t ); };
			el.addEventListener( 'keydown', onKey );
			el.addEventListener( 'blur', finish );
			el.addEventListener( 'paste', onPaste );
		};

		useEffect( () => {
			if ( ! sel ) { return; }
			const ancestors = [];
			let cur = find( doc.tree, sel );
			while ( cur && cur.parent ) { ancestors.push( cur.parent.id ); cur = find( doc.tree, cur.parent.id ); }
			if ( ancestors.some( ( id ) => collapsed[ id ] ) ) {
				setCollapsed( ( c ) => { const n = Object.assign( {}, c ); ancestors.forEach( ( id ) => delete n[ id ] ); return n; } );
			}
		}, [ sel ] );

		useEffect( () => {
			try { window.localStorage.setItem( 'builderlabTheme', theme ); } catch ( e ) { /* storage may be blocked */ }
		}, [ theme ] );
		useEffect( () => {
			try { window.localStorage.setItem( 'builderlabPanels', JSON.stringify( panels ) ); } catch ( e ) { /* storage may be blocked */ }
		}, [ panels ] );
		useEffect( () => {
			const onResize = () => setPanels( ( p ) => ( { left: clampPanel( p.left ), right: clampPanel( p.right ) } ) );
			window.addEventListener( 'resize', onResize );
			return () => window.removeEventListener( 'resize', onResize );
		}, [] );

		// Canvas: render on the server, then write into the frame.
		useEffect( () => {
			if ( ! data ) { return undefined; }
			let cancelled = false;
			setRendering( true );
			const t = setTimeout( () => {
				apiFetch( { path: '/builderlab/v1/editor/render', method: 'POST', data: { tree, post: cfg.postId } } )
					.then( ( r ) => ! cancelled && setHtml( r.html ) )
					.catch( ( e ) => ! cancelled && setMsg( 'The preview could not be updated: ' + ( ( e && e.message ) || 'error' ) ) )
					.finally( () => ! cancelled && setRendering( false ) );
			}, 300 );
			return () => { cancelled = true; clearTimeout( t ); };
		}, [ tree, data ] );

		// Drop handling shared by the layers, the canvas and the element tiles.
		const handleDrop = ( payload, targetId, zone ) => {
			if ( payload.indexOf( 'new:' ) === 0 ) {
				const def = byName[ payload.slice( 4 ) ];
				if ( ! def ) { return; }
				const node = makeNode( def );
				commit( ( t ) => placeRelative( t, node, targetId, zone ) );
				setSel( node.id );
				setLeftTab( 'properties' );
				say( 'Added ' + def.title + ( zone === 'inside' ? ' inside the container.' : '.' ) );
			} else if ( payload.indexOf( 'move:' ) === 0 ) {
				const id = payload.slice( 5 );
				const f = find( tree, id );
				commit( ( t ) => ( targetId ? moveTo( t, id, targetId, zone ) : placeRelative( removeNode( t, id ), f ? f.node : null, null, 'after' ) ) );
				say( ( f ? titleOf( f.node ) : 'Element' ) + ' moved.' );
			}
			setDrop( null );
		};
		api.current = {
			handleDrop, setDrop,
			setSel: ( id ) => { setSel( id ); setLeftTab( 'properties' ); },
			openMenu: ( id, x, y, returnTo ) => { setSel( id ); setMenu( { id, x, y, returnTo: returnTo || null } ); },
			closeMenu: () => setMenu( null ),
			startEdit,
		};

		useEffect( () => {
			const f = frame.current;
			const d = f && f.contentDocument;
			if ( ! d || ! d.body || html === null ) { return; }
			const root = d.querySelector( '[data-bl-root]' ) || d.getElementById( 'bl-canvas' );
			if ( ! root || editing.current ) { return; }
			d.body.classList.add( 'bl-editing' );
			if ( ! d.getElementById( 'bl-edit-css' ) ) {
				const st = d.createElement( 'style' );
				st.id = 'bl-edit-css';
				st.textContent = '[data-bl-id]{cursor:pointer}[data-bl-id]:hover{outline:2px dashed #000;outline-offset:2px}.bl-sel{outline:2px solid #000!important;outline-offset:2px;box-shadow:0 0 0 5px #fff!important}.bl-flag-error{box-shadow:0 0 0 3px #000,0 0 0 5px #fff}.bl-flag-warning{outline:2px dashed #000;outline-offset:3px}.bl-empty-node{padding:16px;border:2px dashed #555;color:#444;background:#f3f3f3}.bl-drop-before{box-shadow:0 -4px 0 0 #000!important}.bl-drop-after{box-shadow:0 4px 0 0 #000!important}.bl-drop-inside{outline:3px dashed #000!important;outline-offset:-3px;background:rgba(0,0,0,.06)}';
				d.head.appendChild( st );
			}
			root.innerHTML = html;
			if ( ! d.__blBound ) {
				d.__blBound = true;
				const clear = () => d.querySelectorAll( '.bl-drop-before,.bl-drop-after,.bl-drop-inside' ).forEach( ( e ) => e.classList.remove( 'bl-drop-before', 'bl-drop-after', 'bl-drop-inside' ) );
				const target = ( e ) => ( e.target.closest ? e.target.closest( '[data-bl-id]' ) : null );
				d.addEventListener( 'click', ( e ) => {
					const el = target( e );
					if ( e.target.closest && e.target.closest( '[contenteditable="true"]' ) ) { return; }
					if ( el ) {
						e.preventDefault();
						const id2 = el.getAttribute( 'data-bl-id' );
						const now = Date.now();
						const last = d.__blLastClick || { id: '', t: 0 };
						d.__blLastClick = { id: id2, t: now };
						if ( last.id === id2 && now - last.t < 450 ) { d.__blLastClick = { id: '', t: 0 }; api.current.startEdit( id2 ); return; }
						api.current.setSel( id2 );
					}
					else if ( e.target.closest && e.target.closest( 'a[href]' ) ) { e.preventDefault(); }
				} );
				d.addEventListener( 'submit', ( e ) => e.preventDefault() );
				d.addEventListener( 'mousedown', () => api.current.closeMenu() );
				d.addEventListener( 'dblclick', ( e ) => {
					const el = target( e );
					if ( el ) { e.preventDefault(); api.current.startEdit( el.getAttribute( 'data-bl-id' ) ); }
				} );
				d.addEventListener( 'contextmenu', ( e ) => {
					const el = target( e );
					if ( ! el ) { return; }
					e.preventDefault();
					const r = f.getBoundingClientRect();
					api.current.openMenu( el.getAttribute( 'data-bl-id' ), r.left + e.clientX, r.top + e.clientY, null );
				} );
				d.addEventListener( 'dragover', ( e ) => {
					e.preventDefault();
					clear();
					const el = target( e );
					if ( ! el ) { return; }
					const r = el.getBoundingClientRect();
					const isC = el.classList.contains( 'bl-container' );
					const zone = zoneFor( ( e.clientY - r.top ) / Math.max( r.height, 1 ), isC );
					el.classList.add( 'bl-drop-' + zone );
				} );
				d.addEventListener( 'dragleave', ( e ) => { if ( ! e.relatedTarget ) { clear(); } } );
				d.addEventListener( 'drop', ( e ) => {
					e.preventDefault();
					clear();
					const el = target( e );
					const payload = e.dataTransfer ? e.dataTransfer.getData( 'text/plain' ) : '';
					if ( ! payload ) { return; }
					if ( ! el ) { api.current.handleDrop( payload, null, 'after' ); return; }
					const r = el.getBoundingClientRect();
					api.current.handleDrop( payload, el.getAttribute( 'data-bl-id' ), zoneFor( ( e.clientY - r.top ) / Math.max( r.height, 1 ), el.classList.contains( 'bl-container' ) ) );
				} );
			}
		}, [ html, frameTick ] );

		useEffect( () => {
			const f = frame.current;
			const d = f && f.contentDocument;
			if ( ! d ) { return; }
			d.querySelectorAll( '.bl-sel,.bl-flag-error,.bl-flag-warning' ).forEach( ( e ) => e.classList.remove( 'bl-sel', 'bl-flag-error', 'bl-flag-warning' ) );
			const sev = {};
			issues.forEach( ( i ) => { sev[ i.id ] = i.severity === 'error' || sev[ i.id ] === 'error' ? 'error' : 'warning'; } );
			Object.keys( sev ).forEach( ( id ) => { const el = d.querySelector( '[data-bl-id="' + id + '"]' ); el && el.classList.add( 'bl-flag-' + sev[ id ] ); } );
			if ( sel ) { const el = d.querySelector( '[data-bl-id="' + sel + '"]' ); el && el.classList.add( 'bl-sel' ); }
		}, [ sel, html, issues, frameTick ] );

		// Scroll the preview to an element, so a flagged problem is visible on the page.
		const revealInPreview = ( id ) => {
			const f = frame.current;
			const d = f && f.contentDocument;
			const el = d && d.querySelector( '[data-bl-id="' + id + '"]' );
			if ( ! el ) { return; }
			const calm = window.matchMedia && window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;
			el.scrollIntoView( { block: 'center', inline: 'nearest', behavior: calm ? 'auto' : 'smooth' } );
		};

		const addBlock = ( def ) => {
			const node = makeNode( def );
			commit( ( t ) => {
				const f = sel ? find( t, sel ) : null;
				if ( f && f.node.name === 'builderlab/container' ) { return insertInto( t, f.node.id, -1, node ); }
				if ( f ) { return insertInto( t, f.parent ? f.parent.id : null, f.index + 1, node ); }
				return insertInto( t, null, -1, node );
			} );
			setSel( node.id );
			setLeftTab( 'properties' );
			say( 'Added ' + def.title + '. Its properties are open.' );
		};
		const setAttr = ( id ) => ( keyOrObj, value ) => commit( ( t ) => mapNodes( t, ( n ) => ( n.id === id ? Object.assign( {}, n, { attrs: Object.assign( {}, n.attrs, typeof keyOrObj === 'object' ? keyOrObj : { [ keyOrObj ]: value } ) } ) : n ) ), id + ':' + ( typeof keyOrObj === 'object' ? 'multi' : keyOrObj ) );
		const act = ( kind ) => {
			if ( ! selected ) { return; }
			const id = selected.node.id;
			const label = titleOf( selected.node );
			if ( kind === 'delete' ) {
				const f = selected;
				commit( ( t ) => removeNode( t, id ) );
				const next = f.list[ f.index + 1 ] || f.list[ f.index - 1 ] || f.parent;
				setSel( next ? next.id : null );
				say( label + ' deleted. Undo is available.' );
			} else if ( kind === 'copy' ) {
				setClip( clone( selected.node ) );
				say( label + ' copied. Use Paste after or Paste inside.' );
			} else if ( kind === 'paste-after' || kind === 'paste-inside' ) {
				if ( ! clip ) { return; }
				const copy = reId( clip );
				commit( ( t ) => {
					if ( kind === 'paste-inside' ) { return insertInto( t, id, -1, copy ); }
					const f = find( t, id );
					return insertInto( t, f.parent ? f.parent.id : null, f.index + 1, copy );
				} );
				setSel( copy.id );
				say( titleOf( copy ) + ' pasted.' );
			} else if ( kind === 'select-parent' ) {
				if ( selected.parent ) { setSel( selected.parent.id ); say( 'Parent container selected.' ); }
			} else if ( kind === 'add-inside' ) {
				setLeftTab( 'elements' );
				say( 'Container selected. Choose an element to add inside it.' );
			} else if ( kind === 'edit' ) {
				setLeftTab( 'properties' );
			} else if ( kind === 'duplicate' ) {
				const copy = reId( selected.node );
				commit( ( t ) => { const f = find( t, id ); return insertInto( t, f.parent ? f.parent.id : null, f.index + 1, copy ); } );
				setSel( copy.id );
				say( label + ' duplicated.' );
			} else {
				commit( ( t ) => move( t, id, kind ) );
				say( label + ' moved ' + { up: 'up', down: 'down', out: 'out of its container', in: 'into the container above' }[ kind ] + '.' );
			}
		};

		const save = ( newStatus ) => {
			setSaving( true );
			setMsg( 'Saving…' );
			apiFetch( { path: API, method: 'POST', data: { tree, title, status: newStatus || status, loaded: loadedAt, force: conflict, template: tpl ? { type: tpl.type, conditions: tpl.conditions, priority: tpl.priority } : undefined, layout: layout || undefined } } )
				.then( ( r ) => {
					setConflict( false );
					setSavedLayout( layout );
					if ( tpl ) { setSavedTpl( tplKey ); }
					setSaved( JSON.stringify( tree ) );
					setSavedTitle( title );
					setStatus( r.status );
					setLoadedAt( r.modified );
					const tail = issues.length ? ` Accessibility: ${ errorCount } errors, ${ issues.length - errorCount } warnings (information only).` : '';
					setMsg( 'Saved at ' + new Date().toLocaleTimeString() + '.' + tail );
				} )
				.catch( ( e ) => {
					setConflict( !! ( e && e.code === 'builderlab_conflict' ) );
					setMsg( 'Could not save: ' + ( ( e && e.message ) || 'error' ) + ' Your changes are still here.' );
				} )
				.finally( () => setSaving( false ) );
		};

		useEffect( () => {
			const key = ( e ) => {
				const tag = ( e.target.tagName || '' ).toLowerCase();
				const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
				if ( ( e.ctrlKey || e.metaKey ) && e.key.toLowerCase() === 's' ) { e.preventDefault(); save(); }
				else if ( ( e.ctrlKey || e.metaKey ) && e.key.toLowerCase() === 'z' && ! typing ) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
				else if ( ( e.ctrlKey || e.metaKey ) && e.key.toLowerCase() === 'y' && ! typing ) { e.preventDefault(); redo(); }
				else if ( e.key === 'Delete' && ! typing && selected ) { e.preventDefault(); act( 'delete' ); }
			};
			window.addEventListener( 'keydown', key );
			return () => window.removeEventListener( 'keydown', key );
		} );
		useEffect( () => {
			const guard = ( e ) => { if ( dirty ) { e.preventDefault(); e.returnValue = ''; } };
			window.addEventListener( 'beforeunload', guard );
			return () => window.removeEventListener( 'beforeunload', guard );
		}, [ dirty ] );

		if ( error ) { return h( 'div', { className: 'bl-app-error', role: 'alert' }, h( 'p', null, error ), h( 'p', null, h( 'a', { href: cfg.settings }, 'Open BuilderLab settings' ) ) ); }
		if ( ! data ) { return h( 'p', { className: 'bl-app-loading' }, 'Loading the editor…' ); }

		const published = status === 'publish';
		const filtered = blocks.filter( ( b ) => ! filter || b.title.toLowerCase().includes( filter.toLowerCase() ) );
		const iconFor = ( n ) => ( byName[ n.name ] ? byName[ n.name ].icon : 'dashicons-admin-generic' );
		const preview = ( n ) => {
			const a = n.attrs || {};
			const comp = a.templateId ? COMPONENTS.find( ( c ) => c.id === a.templateId ) : null;
			const t = ( comp ? comp.title : '' ) || a.content || a.title || a.label || a.caption || a.alt || ( a.source && a.source !== 'static' ? ( a.source === 'featured' ? 'featured image' : 'field ' + ( a.field || '?' ) ) : '' ) || ( typeof a.items === 'string' ? lines( a.items )[ 0 ] : '' ) || '';
			return plain( t ).slice( 0, 34 );
		};
		const issueIds = {};
		issues.forEach( ( i ) => { issueIds[ i.id ] = ( issueIds[ i.id ] || 0 ) + 1; } );

		const layerDrag = ( n ) => ( {
			draggable: true,
			onDragStart: ( e ) => { e.dataTransfer.setData( 'text/plain', 'move:' + n.id ); e.dataTransfer.effectAllowed = 'copyMove'; },
			onDragEnd: () => setDrop( null ),
		} );
		const layerTarget = ( n ) => ( {
			onDragOver: ( e ) => {
				e.preventDefault();
				const r = e.currentTarget.getBoundingClientRect();
				setDrop( { id: n.id, zone: zoneFor( ( e.clientY - r.top ) / Math.max( r.height, 1 ), n.name === 'builderlab/container' ) } );
			},
			onDragLeave: () => setDrop( null ),
			onDrop: ( e ) => {
				e.preventDefault();
				const r = e.currentTarget.getBoundingClientRect();
				handleDrop( e.dataTransfer.getData( 'text/plain' ), n.id, zoneFor( ( e.clientY - r.top ) / Math.max( r.height, 1 ), n.name === 'builderlab/container' ) );
			},
		} );

		const isOpen = ( n ) => ! collapsed[ n.id ];
		const countAll = ( nodes ) => nodes.reduce( ( c, n ) => c + 1 + countAll( n.children || [] ), 0 );
		const containerIds = () => { const ids = []; const go = ( list ) => list.forEach( ( n ) => { if ( n.children && n.children.length ) { ids.push( n.id ); go( n.children ); } } ); go( tree ); return ids; };

		const renderLayer = ( n, depth ) => {
			const kids = n.children || [];
			const isContainer = n.name === 'builderlab/container';
			const open = isOpen( n );
			const groupId = 'bll-group-' + n.id;
			return h( 'li', { key: n.id, className: 'bll-item' + ( isContainer ? ' is-container' : '' ) + ( kids.length ? ' has-kids' : '' ) },
				h( 'div', Object.assign( { className: 'bll' + ( sel === n.id ? ' is-sel' : '' ) + ( drop && drop.id === n.id ? ' is-drop-' + drop.zone : '' ) }, layerTarget( n ) ),
					kids.length
						? h( 'button', { type: 'button', className: 'bll-toggle', 'aria-expanded': open ? 'true' : 'false', 'aria-controls': groupId, 'aria-label': ( open ? 'Collapse ' : 'Expand ' ) + titleOf( n ) + ', ' + kids.length + ( kids.length === 1 ? ' item inside' : ' items inside' ),
							onClick: () => setCollapsed( ( c ) => Object.assign( {}, c, { [ n.id ]: open } ) ) },
							h( 'span', { className: 'dashicons ' + ( open ? 'dashicons-arrow-down-alt2' : 'dashicons-arrow-right-alt2' ), 'aria-hidden': 'true' } ) )
						: h( 'span', { className: 'bll-toggle-space', 'aria-hidden': 'true' } ),
					h( 'button', Object.assign( { type: 'button', className: 'bll-main', 'aria-current': sel === n.id ? 'true' : undefined, 'aria-haspopup': 'menu',
						onClick: () => { setSel( n.id ); setLeftTab( 'properties' ); },
						onContextMenu: ( e ) => { e.preventDefault(); api.current.openMenu( n.id, e.clientX, e.clientY, e.currentTarget ); },
						onKeyDown: ( e ) => {
							if ( e.key === 'ContextMenu' || ( e.shiftKey && e.key === 'F10' ) ) {
								e.preventDefault();
								const r = e.currentTarget.getBoundingClientRect();
								api.current.openMenu( n.id, r.left + 24, r.bottom, e.currentTarget );
							}
						} }, layerDrag( n ) ),
						h( 'span', { className: 'bll-title' }, titleOf( n ), preview( n ) ? h( 'span', { className: 'bll-prev' }, ': ' + preview( n ) ) : null ),
						kids.length ? h( 'span', { className: 'bll-count' }, kids.length ) : null,
						issueIds[ n.id ] ? h( 'span', { className: 'bll-badge' }, issueIds[ n.id ] + ( issueIds[ n.id ] === 1 ? ' issue' : ' issues' ) ) : null ),
					isContainer && h( 'button', { type: 'button', className: 'bll-add', 'aria-label': 'Add an element inside this container', title: 'Add inside', onClick: () => { setSel( n.id ); setLeftTab( 'elements' ); say( 'Container selected. Choose an element to add inside it.' ); } }, h( 'span', { className: 'dashicons dashicons-plus', 'aria-hidden': 'true' } ) ) ),
				kids.length ? h( 'ul', { id: groupId, className: 'bll-list bll-group bll-depth-' + ( depth % 4 ) + ( sel === n.id ? ' is-sel-group' : '' ), 'aria-label': 'Inside ' + titleOf( n ), hidden: ! open }, kids.map( ( c ) => renderLayer( c, depth + 1 ) ) ) : null );
		};

		const toolbar = selected && h( 'div', { className: 'bl-actions', role: 'toolbar', 'aria-label': 'Actions for ' + titleOf( selected.node ) },
			[ [ 'up', 'Move up' ], [ 'down', 'Move down' ], [ 'out', 'Move out of container' ], [ 'in', 'Move into container above' ], [ 'duplicate', 'Duplicate' ], [ 'delete', 'Delete' ] ].map( ( a ) =>
				h( 'button', { key: a[ 0 ], type: 'button', className: 'blb' + ( a[ 0 ] === 'delete' ? ' blb-danger' : '' ), disabled: [ 'up', 'down', 'out', 'in' ].includes( a[ 0 ] ) && ! canMove( tree, selected.node.id, a[ 0 ] ), onClick: () => act( a[ 0 ] ) }, a[ 1 ] ) ) );

		const allFields = selected && ! selected.node.opaque ? UI[ selected.node.name ] || [] : [];
		const tabFields = allFields.filter( ( f ) => groupOf( f ) === propTab && ( ! f.showIf || f.showIf( ( selected && selected.node.attrs ) || {} ) ) );
		const setNode = selected ? setAttr( selected.node.id ) : null;

		const iconBtn = ( icon, label, onClick, extra ) => h( 'button', Object.assign( { type: 'button', className: 'blb blb-icon', 'aria-label': label, title: label, onClick }, extra || {} ), h( 'span', { className: 'dashicons ' + icon, 'aria-hidden': 'true' } ) );

		const menuNode = menu ? find( tree, menu.id ) : null;
		const mIsContainer = menuNode && menuNode.node.name === 'builderlab/container';
		const menuGroups = menuNode ? [
			[ { id: 'edit', label: 'Edit properties' }, mIsContainer ? { id: 'add-inside', label: 'Add inside…' } : null, menuNode.parent ? { id: 'select-parent', label: 'Select parent' } : null ].filter( Boolean ),
			[ { id: 'up', label: 'Move up', disabled: ! canMove( tree, menu.id, 'up' ) }, { id: 'down', label: 'Move down', disabled: ! canMove( tree, menu.id, 'down' ) },
				{ id: 'out', label: 'Move out of container', disabled: ! canMove( tree, menu.id, 'out' ) }, { id: 'in', label: 'Move into container above', disabled: ! canMove( tree, menu.id, 'in' ) } ],
			[ { id: 'duplicate', label: 'Duplicate' }, { id: 'copy', label: 'Copy' }, { id: 'paste-after', label: 'Paste after', disabled: ! clip },
				mIsContainer ? { id: 'paste-inside', label: 'Paste inside', disabled: ! clip } : null ].filter( Boolean ),
			[ { id: 'delete', label: 'Delete', hint: 'Del', danger: true } ],
		] : [];
		const closeMenu = ( refocus ) => {
			const back = menu && menu.returnTo;
			setMenu( null );
			if ( refocus && back && back.focus ) { setTimeout( () => back.focus(), 0 ); }
		};
		const pickMenu = ( actionId ) => {
			const back = menu && menu.returnTo;
			setMenu( null );
			setTimeout( () => act( actionId ), 0 );
			if ( back && back.focus && actionId !== 'delete' ) { setTimeout( () => back.focus(), 30 ); }
		};

		return h( 'div', { className: 'bla' + ( resizing ? ' is-resizing' : '' ), 'data-theme': theme },
			menuNode && h( ContextMenu, { key: menu.id + ':' + menu.x + ':' + menu.y, menu, groups: menuGroups, onPick: pickMenu, onClose: closeMenu, label: 'Actions for ' + titleOf( menuNode.node ) } ),
			h( 'header', { className: 'bla-top' },
				h( 'a', { className: 'blb', href: data.post.listUrl }, h( 'span', { className: 'dashicons dashicons-arrow-left-alt2', 'aria-hidden': 'true' } ), 'Exit to ' + String( data.post.typePlural ).toLowerCase() ),
				h( 'label', { className: 'bla-title' }, h( 'span', { className: 'bl-sr' }, 'Title' ), h( 'input', { type: 'text', value: title, onChange: ( e ) => setTitle( e.target.value ), placeholder: 'Title' } ) ),
				data.layout !== '' && data.layouts && h( 'label', { className: 'bla-layout' },
					h( 'span', { className: 'bl-sr' }, 'Page layout' ),
					h( 'select', { value: layout || 'theme', title: ( data.layouts[ layout || 'theme' ] || '' ), onChange: ( e ) => { setLayout( e.target.value ); say( 'Page layout: ' + data.layouts[ e.target.value ] ); } },
						Object.keys( data.layouts ).map( ( k ) => h( 'option', { key: k, value: k, title: data.layouts[ k ] }, String( data.layouts[ k ] ).split( ':' )[ 0 ] ) ) ) ),
				h( 'div', { className: 'bla-group bla-devices', role: 'group', 'aria-label': 'Preview device' },
					DEVICES.map( ( d ) => iconBtn( d.icon, d.label + ' preview, ' + d.note, () => { setDevice( d.id ); say( d.label + ' view. Width fields now edit the ' + d.label.toLowerCase() + ' value.' ); }, { key: d.id, 'aria-pressed': device === d.id } ) ) ),
				h( 'div', { className: 'bla-group', role: 'group', 'aria-label': 'History' },
					iconBtn( 'dashicons-undo', 'Undo', undo, { disabled: ! doc.past.length } ),
					iconBtn( 'dashicons-redo', 'Redo', redo, { disabled: ! doc.future.length } ) ),
				h( 'button', { type: 'button', className: 'blb', onClick: () => setRightTab( 'a11y' ) }, h( 'span', { className: 'dashicons dashicons-universal-access-alt', 'aria-hidden': 'true' } ), `Accessibility: ${ errorCount } errors` ),
				iconBtn( theme === 'dark' ? 'dashicons-lightbulb' : 'dashicons-moon', theme === 'dark' ? 'Switch to the light editor theme' : 'Switch to the dark editor theme', () => setTheme( theme === 'dark' ? 'light' : 'dark' ) ),
				h( 'a', { className: 'blb', href: data.post.link, target: '_blank', rel: 'noopener noreferrer' }, 'View page', h( 'span', { className: 'bl-sr' }, ' (opens in a new tab)' ) ),
				data.post.editUrl && h( 'a', { className: 'blb', href: data.post.editUrl }, 'Default editor' ),
				h( 'span', { className: 'bla-state' }, dirty ? 'Unsaved changes' : 'All changes saved' ),
				published || ! data.post.canPublish
					? h( 'button', { type: 'button', className: 'blb blb-primary', disabled: saving || ! dirty, onClick: () => save() }, published ? 'Update' : 'Save' )
					: h( Fragment, null,
						h( 'button', { type: 'button', className: 'blb', disabled: saving || ! dirty, onClick: () => save( 'draft' ) }, 'Save draft' ),
						h( 'button', { type: 'button', className: 'blb blb-primary', disabled: saving, onClick: () => save( 'publish' ) }, 'Publish' ) ) ),
			h( 'div', { className: 'bla-msg', role: 'status', 'aria-live': 'polite' }, msg ),
			h( 'div', { className: 'bl-sr', role: 'status', 'aria-live': 'polite' }, announce ),
			h( 'div', { className: 'bla-body', style: { '--bl-left': panels.left + 'px', '--bl-right': panels.right + 'px' } },
				h( 'aside', { className: 'bla-left', 'aria-label': 'Elements and properties' },
					h( Resizer, { side: 'left', width: panels.left, label: 'Resize the left panel', onActive: setResizing, onChange: ( w ) => setPanels( ( p ) => Object.assign( {}, p, { left: w } ) ) } ),
					h( 'div', { className: 'bla-tabs', role: 'group', 'aria-label': 'Left panel' },
						h( 'button', { type: 'button', className: 'blb', 'aria-pressed': leftTab === 'elements', onClick: () => setLeftTab( 'elements' ) }, 'Elements' ),
						h( 'button', { type: 'button', className: 'blb', 'aria-pressed': leftTab === 'properties', onClick: () => setLeftTab( 'properties' ) }, 'Properties' ),
						tpl && h( 'button', { type: 'button', className: 'blb', 'aria-pressed': leftTab === 'template', onClick: () => setLeftTab( 'template' ) }, 'Template' ) ),
					leftTab === 'template' && tpl ? h( TemplatePanel, { tpl, setTpl, options: tpl.options, postId: cfg.postId } ) : leftTab === 'elements'
						? h( 'div', { className: 'bla-pane' },
							h( 'label', { className: 'blf', htmlFor: 'bl-filter' }, 'Search elements' ),
							h( 'input', { id: 'bl-filter', type: 'search', value: filter, onChange: ( e ) => setFilter( e.target.value ) } ),
							h( 'p', { className: 'blf-help' }, 'Drag an element onto the page or into the layers, or press Enter on it to add it. ' + ( selected && selected.node.name === 'builderlab/container' ? 'Pressing Enter adds inside the selected container.' : selected ? 'Pressing Enter adds after the selected element.' : 'Pressing Enter adds at the end of the page.' ) ),
							h( 'ul', { className: 'bla-elements' }, filtered.map( ( b ) =>
								h( 'li', { key: b.name }, h( 'button', {
									type: 'button', className: 'bla-el', title: b.description, draggable: true,
									onClick: () => addBlock( b ),
									onDragStart: ( e ) => { e.dataTransfer.setData( 'text/plain', 'new:' + b.name ); e.dataTransfer.effectAllowed = 'copy'; },
								}, h( 'span', { className: 'dashicons ' + b.icon, 'aria-hidden': 'true' } ), h( 'span', { className: 'bla-el__name' }, b.title ) ) ) ) ) )
						: h( 'div', { className: 'bla-pane' },
							! selected ? h( 'p', null, 'Select an element on the page or in the layers to edit its properties.' )
								: h( Fragment, null,
									h( 'h2', { className: 'bla-h' }, titleOf( selected.node ) ),
									toolbar,
									selected.node.opaque
										? h( 'p', null, 'This is a WordPress block that BuilderLab keeps as it is. You can move, duplicate or delete it.' )
										: h( Fragment, null,
											h( 'div', { className: 'bla-ptabs', role: 'group', 'aria-label': 'Property groups' },
												[ [ 'content', 'Content' ], [ 'style', 'Style' ], [ 'layout', 'Layout' ], [ 'advanced', 'Advanced' ] ].map( ( t ) => h( 'button', { key: t[ 0 ], type: 'button', className: 'blb', 'aria-pressed': propTab === t[ 0 ], onClick: () => setPropTab( t[ 0 ] ) }, t[ 1 ] ) ) ),
											propTab === 'content' && EDITABLE[ selected.node.name ] && h( 'button', { type: 'button', className: 'blb', style: { marginBottom: 14 }, onClick: () => startEdit( selected.node.id ) }, 'Edit text on the page' ),
											propTab === 'style' && ( TEXT_BLOCKS.includes( selected.node.name ) || selected.node.name === 'builderlab/container' ) && h( TypographyFields, { key: 'ty' + dev.id + selected.node.id, attrs: selected.node.attrs || {}, set: setNode, device: dev, align: selected.node.name === 'builderlab/container' } ),
											tabFields.length === 0 && propTab !== 'layout' && propTab !== 'advanced' && ! ( propTab === 'style' && ( TEXT_BLOCKS.includes( selected.node.name ) || selected.node.name === 'builderlab/container' ) ) ? h( 'p', null, 'Nothing to set in this group for this element.' ) : null,
											propTab === 'advanced' && h( Fragment, null,
												h( SpacingField, { key: 'm' + dev.id + selected.node.id, label: 'Margin', keyName: 'margin', value: ( selected.node.attrs || {} ).margin, device: dev, set: setNode, margin: true } ),
												h( SpacingField, { key: 'p' + dev.id + selected.node.id, label: 'Padding', keyName: 'padding', value: ( selected.node.attrs || {} ).padding, device: dev, set: setNode } ),
												h( CustomCssField, { key: 'css' + selected.node.id, value: ( selected.node.attrs || {} ).customCss || '', onChange: ( v ) => setNode( 'customCss', v ) } ) ),
											tabFields.map( ( f ) => h( Control, { key: selected.node.id + f.key + dev.id, field: Object.assign( {}, f, { device: dev } ), attrs: selected.node.attrs || {}, roles, set: setNode } ) ),
											propTab === 'layout' && h( Fragment, null,
												h( FlexItemFields, { attrs: selected.node.attrs || {}, set: setNode, device: dev } ),
												h( WidthField, { attrs: selected.node.attrs || {}, device: dev, set: setNode } ),
												h( HideField, { attrs: selected.node.attrs || {}, set: setNode } ) ) ) ) ) ),
				h( 'main', { className: 'bla-center' },
					h( 'div', { className: 'bla-devicebar' }, h( 'span', { className: 'dashicons ' + dev.icon, 'aria-hidden': 'true' } ), ' ' + dev.note + ( dev.width ? ', shown at ' + dev.width + ' px' : '' ) ),
					h( 'div', { className: 'bla-stage' + ( rendering ? ' is-busy' : '' ) },
						h( 'iframe', { ref: frame, src: data.previewUrl ? data.previewUrl + '&bl_layout=' + encodeURIComponent( layout || 'theme' ) : cfg.canvasUrl, className: 'bla-frame is-' + device, title: 'Page canvas: a live preview of the page. Select elements here or in the layers.', onLoad: () => setFrameTick( ( n ) => n + 1 ) } ) ) ),
				h( 'aside', { className: 'bla-right', 'aria-label': 'Layers and accessibility' },
					h( Resizer, { side: 'right', width: panels.right, label: 'Resize the right panel', onActive: setResizing, onChange: ( w ) => setPanels( ( p ) => Object.assign( {}, p, { right: w } ) ) } ),
					h( 'div', { className: 'bla-tabs', role: 'group', 'aria-label': 'Right panel' },
						h( 'button', { type: 'button', className: 'blb', 'aria-pressed': rightTab === 'layers', onClick: () => setRightTab( 'layers' ) }, 'Layers' ),
						h( 'button', { type: 'button', className: 'blb', 'aria-pressed': rightTab === 'a11y', onClick: () => setRightTab( 'a11y' ) }, 'Accessibility' ) ),
					rightTab === 'layers'
						? h( 'div', { className: 'bla-pane',
							onDragOver: ( e ) => { if ( e.target === e.currentTarget ) { e.preventDefault(); } },
							onDrop: ( e ) => { if ( e.target === e.currentTarget ) { e.preventDefault(); handleDrop( e.dataTransfer.getData( 'text/plain' ), null, 'after' ); } } },
							tree.length ? h( 'div', { className: 'bll-head' },
								h( 'span', null, countAll( tree ) + ( countAll( tree ) === 1 ? ' layer' : ' layers' ) ),
								h( 'span', { className: 'bla-group' },
									h( 'button', { type: 'button', className: 'blb', onClick: () => setCollapsed( {} ) }, 'Expand all' ),
									h( 'button', { type: 'button', className: 'blb', onClick: () => { const c = {}; containerIds().forEach( ( id ) => ( c[ id ] = true ) ); setCollapsed( c ); } }, 'Collapse all' ) ) ) : null,
							tree.length ? h( 'ul', { className: 'bll-list bll-root', 'aria-label': 'Page structure' }, tree.map( ( n ) => renderLayer( n, 0 ) ) ) : h( 'p', { className: 'bla-empty' }, 'The page is empty. Drag an element here, or add one from the left panel.' ),
							h( 'p', { className: 'blf-help' }, 'Drag a layer to reorder it. Drop on the middle of a container to put it inside. Buttons in the properties panel do the same without dragging.' ) )
						: h( 'div', { className: 'bla-pane' },
							h( 'p', { role: 'status' }, issues.length ? `${ errorCount } errors and ${ issues.length - errorCount } warnings. This is information only; it never stops you from saving or publishing.` : 'No automated issues found. Manual checks remain: keyboard, screen reader and zoom.' ),
							h( 'ul', { className: 'bla-issues' }, issues.map( ( i, n ) =>
								h( 'li', { key: n, className: 'is-' + i.severity }, h( 'button', { type: 'button', className: 'bll-main', onClick: () => { setSel( i.id ); setLeftTab( 'properties' ); revealInPreview( i.id ); say( 'Scrolled to ' + ( i.label || 'the element' ) + ' in the preview.' ); } }, h( 'strong', null, ( i.severity === 'error' ? 'Fix: ' : 'Check: ' ) + i.label + '. ' ), i.message, h( 'span', { className: 'bll-prev' }, ' WCAG ' + i.wcag ) ) ) ) ) ) ) ) );
	}

	const root = document.getElementById( 'builderlab-app' );
	if ( root ) {
		if ( wp.element.createRoot ) { wp.element.createRoot( root ).render( h( App ) ); } else { wp.element.render( h( App ), root ); }
	}
} )( window.wp );
