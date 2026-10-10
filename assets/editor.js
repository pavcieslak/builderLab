/* BuilderLab editor: block edit screens plus the built-in accessibility checker.
 * Spike shortcut: written without a build step, using the WordPress React wrapper (wp.element). */
( function ( wp ) {
	'use strict';

	const { registerBlockType, getBlockType } = wp.blocks;
	const { createElement: h, Fragment, useEffect, useState } = wp.element;
	const { useBlockProps, useInnerBlocksProps, InspectorControls, RichText, MediaUpload, MediaUploadCheck } = wp.blockEditor;
	const { PanelBody, SelectControl, ToggleControl, TextControl, ColorPalette, Button, Notice, RangeControl } = wp.components;
	const { useSelect, useDispatch, dispatch, createReduxStore, register } = wp.data;
	const { registerPlugin } = wp.plugins;
	const { addFilter } = wp.hooks;
	const { createHigherOrderComponent } = wp.compose;
	const cfg = window.builderlabConfig || {};
	const ui = wp.editor && wp.editor.PluginSidebar ? wp.editor : wp.editPost;
	const { PluginSidebar, PluginSidebarMoreMenuItem, PluginMoreMenuItem } = ui;

	/* ---------- Contrast tools (WCAG relative luminance) ---------- */

	// Colors come from the design system (assets are localized by PHP); the list below is only a fallback.
	const TOKENS =
		cfg.tokens && cfg.tokens.length
			? cfg.tokens
			: [
					{ name: 'Ink', color: '#14181f' },
					{ name: 'Slate', color: '#4a5560' },
					{ name: 'Blue', color: '#0a58ca' },
					{ name: 'Green', color: '#146c43' },
					{ name: 'Red', color: '#b02a37' },
					{ name: 'Surface', color: '#f4f6f8' },
					{ name: 'White', color: '#ffffff' },
			  ];
	const ROLE = Object.assign( { text: '#14181f', bg: '#ffffff', primary: '#0a58ca', 'on-primary': '#ffffff' }, cfg.roles || {} );

	function parseHex( hex ) {
		const m = /^#([0-9a-f]{6})$/i.exec( hex || '' );
		if ( ! m ) {
			return null;
		}
		const n = parseInt( m[ 1 ], 16 );
		return [ ( n >> 16 ) & 255, ( n >> 8 ) & 255, n & 255 ];
	}
	function luminance( rgb ) {
		const f = ( c ) => {
			c /= 255;
			return c <= 0.03928 ? c / 12.92 : Math.pow( ( c + 0.055 ) / 1.055, 2.4 );
		};
		return 0.2126 * f( rgb[ 0 ] ) + 0.7152 * f( rgb[ 1 ] ) + 0.0722 * f( rgb[ 2 ] );
	}
	function ratio( a, b ) {
		const A = parseHex( a );
		const B = parseHex( b );
		if ( ! A || ! B ) {
			return null;
		}
		const l1 = luminance( A );
		const l2 = luminance( B );
		return ( Math.max( l1, l2 ) + 0.05 ) / ( Math.min( l1, l2 ) + 0.05 );
	}
	/** Token that passes the threshold against bg and is closest in lightness to the current color. */
	function suggest( fg, bg, threshold ) {
		const cur = parseHex( fg );
		const curL = cur ? luminance( cur ) : 0;
		let best = null;
		TOKENS.forEach( ( t ) => {
			const r = ratio( t.color, bg );
			if ( r !== null && r >= threshold && t.color !== bg ) {
				const d = Math.abs( luminance( parseHex( t.color ) ) - curL );
				if ( ! best || d < best.d ) {
					best = { token: t, ratio: r, d };
				}
			}
		} );
		return best;
	}
	const HEX6 = /^#[0-9a-f]{6}$/i;
	/** A block color is a #rrggbb value or the name of a design system role. Returns a hex value or ''. */
	function resolveColor( v ) {
		if ( HEX6.test( v || '' ) ) {
			return v.toLowerCase();
		}
		return ROLE[ v ] && HEX6.test( ROLE[ v ] ) ? ROLE[ v ] : '';
	}
	/** CSS value for the canvas: roles become variables, so a rebrand shows at once. */
	function cssColor( v ) {
		return HEX6.test( v || '' ) ? v : ROLE[ v ] ? 'var(--bl-color-' + v + ')' : '';
	}
	/** Effective colors used for the check. Unset values fall back to the BuilderLab defaults. */
	function effective( attrs, kind ) {
		const fg = resolveColor( attrs.fg );
		const bg = resolveColor( attrs.bg );
		if ( ! fg && ! bg ) {
			return null;
		}
		if ( kind === 'button' ) {
			const outline = attrs.variant === 'outline' || attrs.variant === 'ghost';
			return {
				fg: fg || ( outline ? ROLE.primary : ROLE[ 'on-primary' ] ),
				bg: bg || ( outline ? ROLE.bg : ROLE.primary ),
			};
		}
		return { fg: fg || ROLE.text, bg: bg || ROLE.bg };
	}
	function threshold( name, attrs ) {
		if ( name === 'builderlab/heading' ) {
			return attrs.level <= 4 ? 3 : 4.5; // h1 to h4 are large text (24px, or 18.7px bold).
		}
		return 4.5;
	}

	/** Color picker that offers design system roles first, then a custom color. */
	function ColorRoleSelect( { label, value, onChange } ) {
		const custom = HEX6.test( value || '' );
		const roles = Object.keys( cfg.roles || ROLE );
		return h(
			Fragment,
			null,
			h( SelectControl, {
				label,
				value: custom ? '__custom' : value || '',
				options: [ { label: 'Default for this block', value: '' } ]
					.concat( roles.map( ( r ) => ( { label: r + ' (' + ( ROLE[ r ] || '' ) + ')', value: r } ) ) )
					.concat( [ { label: 'Custom color', value: '__custom' } ] ),
				onChange: ( v ) => onChange( v === '__custom' ? ROLE.text || '#000000' : v ),
			} ),
			custom &&
				h( ColorPalette, { colors: TOKENS, value, onChange: ( v ) => onChange( v || '' ), clearable: true, enableAlpha: false } )
		);
	}

	function ContrastPanel( { attrs, setAttributes, kind, needed, showBg } ) {
		const eff = effective( attrs, kind );
		const result = eff ? ratio( eff.fg, eff.bg ) : null;
		const pass = result !== null && result >= needed;
		const tip = eff && ! pass ? suggest( eff.fg, eff.bg, needed ) : null;
		return h(
			PanelBody,
			{ title: 'Colors and contrast', initialOpen: true },
			h( ColorRoleSelect, { label: 'Text color', value: attrs.fg || '', onChange: ( v ) => setAttributes( { fg: v } ) } ),
			showBg !== false && h( ColorRoleSelect, { label: 'Background color', value: attrs.bg || '', onChange: ( v ) => setAttributes( { bg: v } ) } ),
			eff &&
				result !== null &&
				h(
					Notice,
					{ status: pass ? 'success' : 'error', isDismissible: false, className: 'bl-contrast-notice' },
					pass
						? `Contrast ${ result.toFixed( 2 ) }:1. Meets AA (needs ${ needed }:1).`
						: `Contrast ${ result.toFixed( 2 ) }:1. Fails AA (needs ${ needed }:1).`
				),
			tip &&
				h(
					Button,
					{ variant: 'secondary', onClick: () => setAttributes( { fg: Object.keys( ROLE ).find( ( k ) => ROLE[ k ] === tip.token.color ) || tip.token.color } ) },
					`Use ${ tip.token.name } text (${ tip.ratio.toFixed( 1 ) }:1)`
				),
			eff && h( 'p', { className: 'bl-hint' }, 'Unset colors use the defaults; the background is assumed to be white when only text color is set.' )
		);
	}

	function colorVars( attrs ) {
		const s = {};
		if ( cssColor( attrs.fg ) ) {
			s[ '--bl-fg' ] = cssColor( attrs.fg );
		}
		if ( cssColor( attrs.bg ) ) {
			s[ '--bl-bg' ] = cssColor( attrs.bg );
		}
		return s;
	}

	/* ---------- Blocks (same elements as the server render) ---------- */

	const INLINE = [ 'core/bold', 'core/italic', 'core/link', 'core/code', 'core/subscript', 'core/superscript' ];

	registerBlockType( 'builderlab/heading', {
		edit: ( { attributes, setAttributes } ) => {
			const props = useBlockProps( Object.assign( { className: 'bl-heading', style: colorVars( attributes ) }, attributes.anchor ? { id: attributes.anchor } : {} ) );
			return h(
				Fragment,
				null,
				h(
					InspectorControls,
					null,
					h(
						PanelBody,
						{ title: 'Heading' },
						h( SelectControl, {
							label: 'Level',
							value: String( attributes.level ),
							options: [ 1, 2, 3, 4, 5, 6 ].map( ( n ) => ( { label: 'H' + n, value: String( n ) } ) ),
							onChange: ( v ) => setAttributes( { level: Number( v ) } ),
						} ),
						h( TextControl, {
							label: 'Anchor (optional)',
							help: 'Letters, numbers and hyphens. Lets links jump to this heading.',
							value: attributes.anchor || '',
							onChange: ( v ) => setAttributes( { anchor: v.toLowerCase().replace( /[^a-z0-9-]/g, '' ) } ),
						} )
					),
					h( ContrastPanel, { attrs: attributes, setAttributes, kind: 'text', needed: threshold( 'builderlab/heading', attributes ) } )
				),
				h( RichText, Object.assign( {}, props, {
					tagName: 'h' + attributes.level,
					value: attributes.content,
					onChange: ( v ) => setAttributes( { content: v } ),
					placeholder: 'Heading',
					allowedFormats: INLINE,
				} ) )
			);
		},
		save: () => null,
	} );

	registerBlockType( 'builderlab/text', {
		edit: ( { attributes, setAttributes } ) => {
			const props = useBlockProps( { className: 'bl-text', style: colorVars( attributes ) } );
			return h(
				Fragment,
				null,
				h( InspectorControls, null, h( ContrastPanel, { attrs: attributes, setAttributes, kind: 'text', needed: 4.5 } ) ),
				h( RichText, Object.assign( {}, props, {
					tagName: 'p',
					value: attributes.content,
					onChange: ( v ) => setAttributes( { content: v } ),
					placeholder: 'Write text',
					allowedFormats: INLINE,
				} ) )
			);
		},
		save: () => null,
	} );

	registerBlockType( 'builderlab/button', {
		edit: ( { attributes, setAttributes } ) => {
			const isButton = attributes.kind === 'button';
			const props = useBlockProps( {
				className: 'bl-button' + ( attributes.variant === 'outline' ? ' is-outline' : attributes.variant === 'ghost' ? ' is-ghost' : '' ) + ( attributes.size === 'sm' ? ' is-sm' : attributes.size === 'lg' ? ' is-lg' : '' ),
				style: colorVars( attributes ),
			} );
			return h(
				Fragment,
				null,
				h(
					InspectorControls,
					null,
					h(
						PanelBody,
						{ title: 'Button' },
						h( SelectControl, {
							label: 'Element',
							value: attributes.kind,
							options: [
								{ label: 'Link (goes to a page)', value: 'link' },
								{ label: 'Button (does an action)', value: 'button' },
							],
							onChange: ( v ) => setAttributes( { kind: v } ),
						} ),
						! isButton &&
							h( TextControl, {
								label: 'Link address',
								type: 'url',
								value: attributes.url,
								onChange: ( v ) => setAttributes( { url: v } ),
							} ),
						! isButton &&
							h( ToggleControl, {
								label: 'Open in a new tab',
								help: 'Screen readers are told that it opens in a new tab.',
								checked: attributes.newTab,
								onChange: ( v ) => setAttributes( { newTab: v } ),
							} ),
						h( SelectControl, {
							label: 'Style',
							value: attributes.variant,
							options: [ { label: 'Solid', value: 'solid' }, { label: 'Outline', value: 'outline' }, { label: 'Ghost (text only)', value: 'ghost' } ],
							onChange: ( v ) => setAttributes( { variant: v } ),
						} ),
						h( SelectControl, {
							label: 'Size',
							value: attributes.size || 'md',
							options: [ { label: 'Small', value: 'sm' }, { label: 'Medium', value: 'md' }, { label: 'Large', value: 'lg' } ],
							onChange: ( v ) => setAttributes( { size: v } ),
						} )
					),
					h( ContrastPanel, { attrs: attributes, setAttributes, kind: 'button', needed: 4.5 } )
				),
				h( RichText, Object.assign( {}, props, {
					tagName: isButton ? 'button' : 'a',
					value: attributes.content,
					onChange: ( v ) => setAttributes( { content: v } ),
					placeholder: 'Button text',
					allowedFormats: [],
					withoutInteractiveFormatting: true,
				} ) )
			);
		},
		save: () => null,
	} );

	registerBlockType( 'builderlab/image', {
		edit: ( { attributes, setAttributes } ) => {
			const { url, alt, decorative, caption } = attributes;
			const choose = ( media ) => setAttributes( { id: media.id, url: media.url, alt: attributes.alt || media.alt || '' } );
			const controls = h(
				InspectorControls,
				null,
				h(
					PanelBody,
					{ title: 'Image' },
					h( ToggleControl, {
						label: 'Decorative image (no meaning)',
						help: 'Screen readers skip it. Use for pure decoration only.',
						checked: decorative,
						onChange: ( v ) => setAttributes( { decorative: v } ),
					} ),
					! decorative &&
						h( TextControl, {
							label: 'Alt text (describe what the image shows)',
							value: alt,
							onChange: ( v ) => setAttributes( { alt: v } ),
						} ),
					h( TextControl, { label: 'Caption', value: caption, onChange: ( v ) => setAttributes( { caption: v } ) } ),
					url && h( Button, { variant: 'secondary', isDestructive: true, onClick: () => setAttributes( { id: 0, url: '' } ) }, 'Remove image' )
				)
			);
			const shownAlt = decorative ? '' : alt;
			if ( ! url ) {
				const props = useBlockProps( { className: 'bl-image-placeholder' } );
				return h(
					'div',
					props,
					controls,
					h(
						MediaUploadCheck,
						null,
						h( MediaUpload, {
							onSelect: choose,
							allowedTypes: [ 'image' ],
							value: attributes.id,
							render: ( { open } ) => h( Button, { variant: 'primary', onClick: open }, 'Choose image' ),
						} )
					)
				);
			}
			if ( caption ) {
				const props = useBlockProps( { className: 'bl-figure' } );
				return h(
					'figure',
					props,
					controls,
					h( 'img', { className: 'bl-image', src: url, alt: shownAlt } ),
					h( 'figcaption', null, caption )
				);
			}
			const props = useBlockProps( { className: 'bl-image' } );
			return h( Fragment, null, controls, h( 'img', Object.assign( {}, props, { src: url, alt: shownAlt } ) ) );
		},
		save: () => null,
	} );

	registerBlockType( 'builderlab/container', {
		edit: ( { attributes, setAttributes } ) => {
			const cls = 'bl-container' + ( attributes.layout === 'row' ? ' is-row' : '' ) + ( attributes.boxed ? ' is-boxed' : '' );
			const style = { '--bl-gap': 'var(--bl-space-' + ( attributes.gap >= 0 && attributes.gap <= 6 ? attributes.gap : 3 ) + ')' };
			if ( cssColor( attributes.bg ) ) {
				style[ '--bl-bg' ] = cssColor( attributes.bg );
			}
			const blockProps = useBlockProps( { className: cls, style } );
			if ( attributes.label ) {
				blockProps[ 'aria-label' ] = attributes.label;
			}
			const inner = useInnerBlocksProps( blockProps, {} );
			return h(
				Fragment,
				null,
				h(
					InspectorControls,
					null,
					h(
						PanelBody,
						{ title: 'Container' },
						h( SelectControl, {
							label: 'HTML element',
							value: attributes.tag,
							options: [ 'div', 'section', 'header', 'footer', 'main', 'aside', 'nav', 'article' ].map( ( t ) => ( { label: '<' + t + '>', value: t } ) ),
							onChange: ( v ) => setAttributes( { tag: v } ),
						} ),
						h( TextControl, {
							label: 'Accessible name (landmarks)',
							help: 'Required for nav. Useful for section, aside and other landmarks.',
							value: attributes.label,
							onChange: ( v ) => setAttributes( { label: v } ),
						} ),
						h( SelectControl, {
							label: 'Layout',
							value: attributes.layout,
							options: [ { label: 'Stack', value: 'stack' }, { label: 'Row', value: 'row' } ],
							onChange: ( v ) => setAttributes( { layout: v } ),
						} ),
						h( ToggleControl, { label: 'Limit the width', checked: attributes.boxed, onChange: ( v ) => setAttributes( { boxed: v } ) } ),
						h( RangeControl, { label: 'Gap', value: attributes.gap, min: 0, max: 6, onChange: ( v ) => setAttributes( { gap: v } ) } )
					),
					h(
						PanelBody,
						{ title: 'Background', initialOpen: false },
						h( ColorRoleSelect, { label: 'Background color', value: attributes.bg || '', onChange: ( v ) => setAttributes( { bg: v } ) } ),
						h( 'p', { className: 'bl-hint' }, 'Text inside is checked against this color by the accessibility checker.' )
					)
				),
				h( attributes.tag || 'div', inner )
			);
		},
		save: () => wp.element.createElement( wp.blockEditor.InnerBlocks.Content ),
	} );

	/* ---------- Accessibility checker ---------- */

	const STORE = 'builderlab/a11y';
	const VAGUE = /^(click here|here|read more|more|learn more|link|submit|go|click)$/i;
	const FILE_LIKE = /\.(png|jpe?g|gif|webp|svg|avif)$/i;
	const AXE_TAGS = [ 'wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa' ];
	const AXE_OFF = [
		'region', 'landmark-one-main', 'page-has-heading-one', 'bypass', 'document-title', 'html-has-lang', 'html-lang-valid',
		'landmark-no-duplicate-banner', 'landmark-no-duplicate-contentinfo', 'landmark-no-duplicate-main', 'landmark-banner-is-top-level',
		'landmark-contentinfo-is-top-level', 'landmark-main-is-top-level', 'landmark-complementary-is-top-level', 'landmark-unique',
	];
	const EDITOR_ARIA_RULES = [ 'aria-allowed-attr', 'aria-allowed-role', 'aria-valid-attr-value', 'aria-prohibited-attr' ];
	const AXE_EXCLUDE = [
		'.block-list-appender', '.block-editor-block-list__insertion-point', '.block-editor-default-block-appender',
		'.components-placeholder', '.block-editor-block-popover', '.wp-block-post-title',
	];

	register(
		createReduxStore( STORE, {
			reducer( state = { issues: [], scanning: false, error: '', lastRun: 0 }, action ) {
				switch ( action.type ) {
					case 'ISSUES':
						return Object.assign( {}, state, { issues: action.issues, lastRun: action.time } );
					case 'SCANNING':
						return Object.assign( {}, state, { scanning: action.value } );
					case 'ERROR':
						return Object.assign( {}, state, { error: action.message } );
				}
				return state;
			},
			actions: {
				setIssues: ( issues ) => ( { type: 'ISSUES', issues, time: Date.now() } ),
				setScanning: ( value ) => ( { type: 'SCANNING', value } ),
				setError: ( message ) => ( { type: 'ERROR', message } ),
			},
			selectors: {
				getIssues: ( s ) => s.issues,
				isScanning: ( s ) => s.scanning,
				getError: ( s ) => s.error,
				getBlockSeverity: ( s, clientId ) => {
					let sev = '';
					s.issues.forEach( ( i ) => {
						if ( i.clientId === clientId ) {
							sev = i.severity === 'error' || sev === 'error' ? 'error' : 'warning';
						}
					} );
					return sev;
				},
			},
		} )
	);

	function plain( html ) {
		const d = document.createElement( 'div' );
		d.innerHTML = html || '';
		return ( d.textContent || '' ).trim();
	}
	function titleOf( name ) {
		const t = getBlockType( name );
		return t ? t.title : name;
	}

	/** Layer A: fast rules on block attributes. No library, no DOM. */
	function ruleCheck( blocks ) {
		const out = [];
		let prevLevel = 1; // The page title (h1) normally comes from the theme.
		const add = ( b, rule, severity, wcag, message, axe ) =>
			out.push( { clientId: b.clientId, rule, severity, wcag, message, axe: axe || '', blockTitle: titleOf( b.name ) } );
		const walk = ( list ) =>
			list.forEach( ( b ) => {
				const a = b.attributes || {};
				if ( b.name === 'builderlab/heading' || b.name === 'core/heading' ) {
					const level = Number( a.level ) || 2;
					if ( ! plain( a.content ) ) {
						add( b, 'empty-heading', 'error', '2.4.6', 'Heading is empty. Add text or remove it.', 'empty-heading' );
					}
					if ( level === 1 ) {
						add( b, 'h1-in-content', 'warning', '1.3.1', 'This page probably already has an h1 (the page title). Use h2 or lower here.' );
					}
					if ( level > prevLevel + 1 ) {
						add( b, 'heading-skip', 'error', '1.3.1', `Heading level skipped: H${ prevLevel } to H${ level }. Use H${ prevLevel + 1 }.`, 'heading-order' );
					}
					prevLevel = level;
				}
				if ( b.name === 'builderlab/image' || b.name === 'core/image' ) {
					const decorative = b.name === 'builderlab/image' && a.decorative;
					if ( ( a.url || a.id ) && ! decorative ) {
						const alt = ( a.alt || '' ).trim();
						if ( ! alt ) {
							add( b, 'alt-missing', 'error', '1.1.1', 'Image has no alt text. Describe it, or mark it as decorative.', 'image-alt' );
						} else if ( FILE_LIKE.test( alt ) ) {
							add( b, 'alt-filename', 'warning', '1.1.1', 'Alt text looks like a file name. Describe what the image shows.' );
						}
					}
				}
				if ( b.name === 'builderlab/button' ) {
					if ( ! plain( a.content ) ) {
						add( b, 'button-empty', 'error', '4.1.2', 'Button has no text, so it has no accessible name.', a.kind === 'button' ? 'button-name' : 'link-name' );
					} else if ( VAGUE.test( plain( a.content ) ) ) {
						add( b, 'link-vague', 'warning', '2.4.4', `"${ plain( a.content ) }" does not say where it goes or what it does. Use a specific label.` );
					}
					if ( a.kind !== 'button' && ! ( a.url || '' ).trim() ) {
						add( b, 'link-no-url', 'error', '2.4.4', 'Link has no destination. It will not be shown on the page.' );
					}
				}
				if ( b.name === 'builderlab/container' && a.tag === 'nav' && ! ( a.label || '' ).trim() ) {
					add( b, 'nav-no-name', 'warning', '1.3.1', 'A navigation landmark should have a name, so people can tell navigations apart.' );
				}
				if ( b.name === 'builderlab/text' && ! plain( a.content ) ) {
					add( b, 'text-empty', 'warning', '1.3.1', 'Empty text block. Add text or remove it.' );
				}
				if ( [ 'builderlab/heading', 'builderlab/text', 'builderlab/button' ].includes( b.name ) ) {
					const kind = b.name === 'builderlab/button' ? 'button' : 'text';
					const eff = effective( a, kind );
					const needed = threshold( b.name, a );
					const r = eff ? ratio( eff.fg, eff.bg ) : null;
					if ( r !== null && r < needed ) {
						add( b, 'contrast', 'error', '1.4.3', `Contrast ${ r.toFixed( 2 ) }:1 is below the ${ needed }:1 needed for AA.`, 'color-contrast' );
					}
				}
				// Rules registered by the block screens (assets/editor/blocks.js).
				( ( window.builderlab && window.builderlab.rules ) || [] ).forEach( ( r ) =>
					r.fn( b, ( rule, severity, wcag, message, axe ) => add( b, rule, severity, wcag, message, axe ) )
				);
				if ( b.innerBlocks && b.innerBlocks.length ) {
					walk( b.innerBlocks );
				}
			} );
		walk( blocks );
		return out;
	}

	function getCanvas() {
		const f = document.querySelector( 'iframe[name="editor-canvas"]' );
		if ( f && f.contentDocument && f.contentDocument.body ) {
			return { doc: f.contentDocument, win: f.contentWindow };
		}
		return { doc: document, win: window };
	}
	function loadAxe( win, doc ) {
		if ( win.axe ) {
			return Promise.resolve( win.axe );
		}
		return new Promise( ( resolve, reject ) => {
			const s = doc.createElement( 'script' );
			s.src = cfg.axeUrl;
			s.onload = () => ( win.axe ? resolve( win.axe ) : reject( new Error( 'axe-core did not initialize' ) ) );
			s.onerror = () => reject( new Error( 'Could not load axe-core' ) );
			doc.head.appendChild( s );
		} );
	}

	/** Layer B: axe-core against the rendered canvas (computed styles, structure). */
	async function axeScan() {
		const { doc, win } = getCanvas();
		const root = doc.querySelector( '.is-root-container' ) || doc.querySelector( '.editor-styles-wrapper' );
		if ( ! root ) {
			return [];
		}
		const axe = await loadAxe( win, doc );
		const rules = {};
		AXE_OFF.forEach( ( id ) => ( rules[ id ] = { enabled: false } ) );
		const res = await axe.run( { include: [ root ], exclude: AXE_EXCLUDE }, {
			runOnly: { type: 'tag', values: AXE_TAGS },
			rules,
			resultTypes: [ 'violations' ],
			elementRef: true,
		} );
		const out = [];
		res.violations.forEach( ( v ) => {
			v.nodes.forEach( ( n ) => {
				// The editor adds its own ARIA attributes to block wrappers. They never reach the public page.
				if ( EDITOR_ARIA_RULES.includes( v.id ) && n.element && n.element.hasAttribute( 'data-block' ) ) {
					return;
				}
				const blockEl = n.element && n.element.closest ? n.element.closest( '[data-block]' ) : null;
				const clientId = blockEl ? blockEl.getAttribute( 'data-block' ) : '';
				const name = blockEl ? blockEl.getAttribute( 'data-type' ) : '';
				const detail = n.any && n.any[ 0 ] && n.any[ 0 ].message ? n.any[ 0 ].message : v.help;
				out.push( {
					clientId,
					rule: 'axe:' + v.id,
					axe: v.id,
					severity: v.impact === 'critical' || v.impact === 'serious' ? 'error' : 'warning',
					wcag: ( v.tags.filter( ( t ) => /^wcag\d{3,}$/.test( t ) )[ 0 ] || '' ).replace( /^wcag(\d)(\d)(\d+)$/, '$1.$2.$3' ),
					message: detail,
					blockTitle: name ? titleOf( name ) : 'Page',
				} );
			} );
		} );
		return out;
	}

	function merge( a, b ) {
		const seen = new Set( a.filter( ( i ) => i.axe ).map( ( i ) => i.clientId + '|' + i.axe ) );
		const msgs = new Set();
		const extra = b.filter( ( i ) => {
			const key = i.clientId + '|' + i.axe;
			const dupe = seen.has( key ) || msgs.has( key + '|' + i.message );
			msgs.add( key + '|' + i.message );
			return ! dupe;
		} );
		return a.concat( extra );
	}

	function useEnabled() {
		return useSelect( ( s ) => !! s( 'core/preferences' ).get( 'builderlab', 'checker' ), [] );
	}
	function setEnabled( value ) {
		dispatch( 'core/preferences' ).set( 'builderlab', 'checker', value );
	}

	function Checker() {
		const enabled = useEnabled();
		const blocks = useSelect( ( s ) => s( 'core/block-editor' ).getBlocks(), [] );
		const { setIssues, setScanning, setError } = useDispatch( STORE );
		useEffect( () => {
			if ( ! enabled ) {
				setIssues( [] );
				setScanning( false );
				return undefined;
			}
			const a = ruleCheck( blocks );
			setIssues( a );
			setScanning( true );
			let cancelled = false;
			const timer = setTimeout( async () => {
				try {
					const b = await axeScan();
					if ( ! cancelled ) {
						setIssues( merge( a, b ) );
						setError( '' );
					}
				} catch ( e ) {
					if ( ! cancelled ) {
						setError( String( ( e && e.message ) || e ) );
					}
				} finally {
					if ( ! cancelled ) {
						setScanning( false );
					}
				}
			}, 1000 );
			return () => {
				cancelled = true;
				clearTimeout( timer );
			};
		}, [ enabled, blocks ] );
		return null;
	}

	addFilter(
		'editor.BlockListBlock',
		'builderlab/a11y-flag',
		createHigherOrderComponent( ( BlockListBlock ) => ( props ) => {
			const sev = useSelect( ( s ) => s( STORE ).getBlockSeverity( props.clientId ), [ props.clientId ] );
			if ( ! sev ) {
				return h( BlockListBlock, props );
			}
			return h( BlockListBlock, Object.assign( {}, props, {
				className: [ props.className, 'bl-a11y-flag', 'bl-a11y-flag--' + sev ].filter( Boolean ).join( ' ' ),
			} ) );
		}, 'withBuilderlabFlag' )
	);

	const ICON = h(
		'svg',
		{ viewBox: '0 0 24 24', width: 24, height: 24, 'aria-hidden': true, focusable: false },
		h( 'path', { d: 'M12 2a2 2 0 110 4 2 2 0 010-4zm8 6H4v2h6v3.5l-2 7.5h2.2l1.8-6 1.8 6H16l-2-7.5V10h6V8z' } )
	);

	/** Shown inside the pre-publish panel (the panel that opens when Publish is pressed). Informational only. */
	const PrePublishPanel =
		( wp.editor && wp.editor.PluginPrePublishPanel ) || ( wp.editPost && wp.editPost.PluginPrePublishPanel );

	function PrePublish() {
		const blocks = useSelect( ( s ) => s( 'core/block-editor' ).getBlocks(), [] );
		const { selectBlock } = useDispatch( 'core/block-editor' );
		const [ state, setState ] = useState( { loading: true, issues: [], failed: false } );
		useEffect( () => {
			let cancelled = false;
			const a = ruleCheck( blocks );
			setState( { loading: true, issues: a, failed: false } );
			axeScan()
				.then( ( b ) => ! cancelled && setState( { loading: false, issues: merge( a, b ), failed: false } ) )
				.catch( () => ! cancelled && setState( { loading: false, issues: a, failed: true } ) );
			return () => {
				cancelled = true;
			};
		}, [ blocks ] );
		const errors = state.issues.filter( ( i ) => i.severity === 'error' );
		const warnings = state.issues.length - errors.length;
		let text;
		if ( state.loading && ! state.issues.length ) {
			text = 'Checking accessibility…';
		} else if ( ! state.issues.length ) {
			text = 'No automated accessibility errors found. Manual checks remain: keyboard, screen reader and zoom.';
		} else {
			text = `Accessibility errors: ${ errors.length }. Warnings: ${ warnings }. You can still publish.`;
		}
		return h(
			'div',
			{ className: 'bl-a11y-prepublish' },
			h( 'p', { role: 'status', 'aria-live': 'polite', className: 'bl-a11y-summary' }, text ),
			state.failed && h( 'p', { className: 'bl-hint' }, 'The full page scan could not run. Only block rules are shown.' ),
			state.issues.length > 0 &&
				h(
					'ul',
					{ className: 'bl-a11y-list' },
					state.issues.map( ( i, n ) =>
						h(
							'li',
							{ key: n, className: 'bl-a11y-item bl-a11y-item--' + i.severity },
							h(
								Button,
								{ variant: 'link', disabled: ! i.clientId, onClick: () => i.clientId && selectBlock( i.clientId ) },
								`${ i.blockTitle }. ${ i.message }`
							),
							i.wcag && h( 'span', { className: 'bl-a11y-ref' }, ' WCAG ' + i.wcag )
						)
					)
				)
		);
	}

	function Panel() {
		const enabled = useEnabled();
		const { issues, scanning, error } = useSelect( ( s ) => ( {
			issues: s( STORE ).getIssues(),
			scanning: s( STORE ).isScanning(),
			error: s( STORE ).getError(),
		} ), [] );
		const { selectBlock } = useDispatch( 'core/block-editor' );
		const errors = issues.filter( ( i ) => i.severity === 'error' ).length;
		const warnings = issues.length - errors;
		let summary = '';
		if ( enabled && scanning && ! issues.length ) {
			summary = 'Checking…';
		} else if ( enabled && ! issues.length ) {
			summary = 'No automated issues found. Manual checks remain: keyboard, screen reader and zoom.';
		} else if ( enabled ) {
			summary = `${ issues.length } to fix: ${ errors } error${ errors === 1 ? '' : 's' }, ${ warnings } warning${ warnings === 1 ? '' : 's' }.`;
		}
		return h(
			Fragment,
			null,
			h( PluginMoreMenuItem, { icon: ICON, onClick: () => setEnabled( ! enabled ) }, enabled ? 'Turn accessibility checker off' : 'Turn accessibility checker on' ),
			h( PluginSidebarMoreMenuItem, { target: 'builderlab-a11y', icon: ICON }, 'Accessibility checker' ),
			h(
				PluginSidebar,
				{ name: 'builderlab-a11y', title: 'Accessibility checker', icon: ICON },
				h(
					'div',
					{ className: 'bl-a11y-panel' },
					h( ToggleControl, {
						label: 'Check accessibility while editing',
						help: 'Flags elements that fail WCAG 2.2 level AA. Automated checks find only part of the issues.',
						checked: enabled,
						onChange: setEnabled,
					} ),
					h( 'p', { role: 'status', 'aria-live': 'polite', className: 'bl-a11y-summary' }, summary ),
					error && h( Notice, { status: 'warning', isDismissible: false }, 'The page scan could not run: ' + error + '. Block rules still apply.' ),
					enabled &&
						issues.length > 0 &&
						h(
							'ul',
							{ className: 'bl-a11y-list' },
							issues.map( ( i, n ) =>
								h(
									'li',
									{ key: n, className: 'bl-a11y-item bl-a11y-item--' + i.severity },
									h(
										Button,
										{ variant: 'link', disabled: ! i.clientId, onClick: () => i.clientId && selectBlock( i.clientId ) },
										`${ i.severity === 'error' ? 'Fix' : 'Check' }: ${ i.blockTitle }. ${ i.message }`
									),
									i.wcag && h( 'span', { className: 'bl-a11y-ref' }, ' WCAG ' + i.wcag )
								)
							)
						)
				)
			),
			PrePublishPanel &&
				h( PrePublishPanel, { title: 'Accessibility errors', initialOpen: true, icon: ICON }, h( PrePublish ) ),
			h( Checker )
		);
	}

	registerPlugin( 'builderlab-a11y', { render: Panel, icon: ICON } );
} )( window.wp );
