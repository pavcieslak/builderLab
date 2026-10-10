/* BuilderLab editor: screens and checker rules for the content blocks.
 * The canvas shows the real server output (server side render). */
( function ( wp ) {
	'use strict';

	const BL = window.builderlab;
	const { h, plain, lines, Repeater, Panel } = BL;
	const { registerBlockType } = wp.blocks;
	const { useEffect } = wp.element;
	const { TextControl, TextareaControl, SelectControl, ToggleControl, Notice } = wp.components;

	const reg = ( name, controls ) => registerBlockType( 'builderlab/' + name, { edit: BL.ssrEdit( 'builderlab/' + name, controls ), save: () => null } );
	const set = ( p, key ) => ( v ) => p.setAttributes( { [ key ]: v } );
	const text = ( p, key, label, help ) => h( TextControl, { label, help, value: p.attributes[ key ] || '', onChange: set( p, key ) } );
	const area = ( p, key, label, help, rows ) => h( TextareaControl, { label, help, rows: rows || 5, value: p.attributes[ key ] || '', onChange: set( p, key ) } );
	const toggle = ( p, key, label, help ) => h( ToggleControl, { label, help, checked: !! p.attributes[ key ], onChange: set( p, key ) } );

	/* ---- list ---- */
	reg( 'list', ( p ) => Panel( 'List', [
		area( p, 'items', 'Items', 'One item per line.' ),
		toggle( p, 'ordered', 'Numbered list', 'Use when the order matters.' ),
	] ) );
	BL.addRule( 'list', ( b, add ) => {
		if ( b.name === 'builderlab/list' && ! lines( b.attributes.items ).length ) {
			add( 'list-empty', 'warning', '1.3.1', 'The list has no items.' );
		}
	} );

	/* ---- divider ---- */
	reg( 'divider', () => Panel( 'Divider', h( 'p', null, 'A decorative break between sections. It carries no meaning for screen readers beyond a separator.' ) ) );

	/* ---- quote ---- */
	reg( 'quote', ( p ) => Panel( 'Quote', [
		area( p, 'content', 'Quotation', '', 4 ),
		text( p, 'source', 'Source', 'Shown under the quote, for example the author.' ),
	] ) );
	BL.addRule( 'quote', ( b, add ) => {
		if ( b.name === 'builderlab/quote' && ! plain( b.attributes.content ) ) {
			add( 'quote-empty', 'warning', '1.3.1', 'The quotation is empty.' );
		}
	} );

	/* ---- table ---- */
	reg( 'table', ( p ) => Panel( 'Table', [
		text( p, 'caption', 'Caption (required)', 'Names the table for everyone, including screen reader users.' ),
		toggle( p, 'headerRow', 'First row is a header row' ),
		toggle( p, 'rowHeaders', 'First column is a header column' ),
		area( p, 'data', 'Data', 'One row per line. Separate cells with the | character.', 8 ),
	] ) );
	BL.addRule( 'table', ( b, add ) => {
		if ( b.name !== 'builderlab/table' ) {
			return;
		}
		const a = b.attributes;
		const rows = lines( a.data );
		if ( ! rows.length ) {
			add( 'table-empty', 'warning', '1.3.1', 'The table has no data.' );
			return;
		}
		if ( ! plain( a.caption ) ) {
			add( 'table-caption', 'error', '1.3.1', 'The table has no caption. Add a short caption that names it.' );
		}
		const header = a.headerRow !== false;
		if ( ! header && ! a.rowHeaders ) {
			add( 'table-headers', 'error', '1.3.1', 'The table has no header cells. Turn on a header row or a header column.' );
		}
		if ( header && rows[ 0 ].split( '|' ).some( ( c ) => ! c.trim() ) ) {
			add( 'table-empty-header', 'error', '1.3.1', 'A header cell is empty. Every column needs a header.' );
		}
	} );

	/* ---- alert ---- */
	reg( 'alert', ( p ) => Panel( 'Alert', [
		h( SelectControl, { label: 'Type', value: p.attributes.type, options: [
			{ label: 'Information', value: 'info' }, { label: 'Success', value: 'success' },
			{ label: 'Warning', value: 'warning' }, { label: 'Error', value: 'error' } ], onChange: set( p, 'type' ) } ),
		text( p, 'title', 'Title' ),
		area( p, 'content', 'Message', 'A blank line starts a new paragraph.', 4 ),
		h( 'p', null, 'The type is shown as a word, so meaning never depends on color alone.' ),
	] ) );
	BL.addRule( 'alert', ( b, add ) => {
		if ( b.name === 'builderlab/alert' && ! plain( b.attributes.title ) && ! plain( b.attributes.content ) ) {
			add( 'alert-empty', 'warning', '1.3.1', 'The alert has no text.' );
		}
	} );

	/* ---- html ---- */
	reg( 'html', ( p ) => Panel( 'HTML', [
		area( p, 'html', 'HTML', '', 10 ),
		h( Notice, { status: 'info', isDismissible: false }, 'Scripts, styles and frames are removed. The checker scans what is left.' ),
	] ) );

	/* ---- accordion ---- */
	reg( 'accordion', ( p ) => Panel( 'Accordion', [
		h( Repeater, {
			label: 'Accordion items', itemLabel: 'Item', addLabel: 'Add item', items: p.attributes.items,
			blank: { title: '', content: '' },
			fields: [ { key: 'title', label: 'Title' }, { key: 'content', label: 'Content', type: 'textarea', help: 'A blank line starts a new paragraph.' } ],
			onChange: set( p, 'items' ),
		} ),
		toggle( p, 'exclusive', 'Only one open at a time' ),
		toggle( p, 'openFirst', 'First item open' ),
	] ) );
	BL.addRule( 'accordion', ( b, add ) => {
		if ( b.name !== 'builderlab/accordion' ) {
			return;
		}
		const items = b.attributes.items || [];
		if ( ! items.length ) {
			add( 'accordion-empty', 'warning', '1.3.1', 'The accordion has no items.' );
		}
		if ( items.some( ( i ) => ! plain( i.title ) ) ) {
			add( 'accordion-title', 'error', '4.1.2', 'An accordion item has no title, so the control has no name.' );
		}
	} );

	/* ---- tabs ---- */
	reg( 'tabs', ( p ) => Panel( 'Tabs', [
		text( p, 'label', 'Name of the tab group', 'Read out by screen readers, for example "Product details".' ),
		h( SelectControl, { label: 'Heading level of tab titles', value: String( p.attributes.level || 3 ),
			options: [ 2, 3, 4, 5, 6 ].map( ( n ) => ( { label: 'H' + n, value: String( n ) } ) ),
			onChange: ( v ) => p.setAttributes( { level: Number( v ) } ) } ),
		h( Repeater, {
			label: 'Tabs', itemLabel: 'Tab', addLabel: 'Add tab', items: p.attributes.items,
			blank: { title: '', content: '' },
			fields: [ { key: 'title', label: 'Title' }, { key: 'content', label: 'Content', type: 'textarea', help: 'A blank line starts a new paragraph.' } ],
			onChange: set( p, 'items' ),
		} ),
	] ) );
	BL.addRule( 'tabs', ( b, add ) => {
		if ( b.name !== 'builderlab/tabs' ) {
			return;
		}
		const items = b.attributes.items || [];
		if ( items.length < 2 ) {
			add( 'tabs-few', 'warning', '1.3.1', 'Tabs need at least two tabs. Use plain content instead.' );
		}
		if ( items.some( ( i ) => ! plain( i.title ) ) ) {
			add( 'tabs-title', 'error', '4.1.2', 'A tab has no title, so the control has no name.' );
		}
		if ( ! plain( b.attributes.label ) ) {
			add( 'tabs-label', 'warning', '4.1.2', 'Name the tab group, for example "Product details".' );
		}
	} );

	/* ---- nav ---- */
	reg( 'nav', ( p ) => Panel( 'Navigation', [
		text( p, 'label', 'Name of this navigation (required)', 'Read out by screen readers, for example "Main" or "Footer".' ),
		area( p, 'items', 'Links', 'One link per line: Label | address. Start a line with "- " to place it in a submenu.', 8 ),
	] ) );
	BL.addRule( 'nav', ( b, add ) => {
		if ( b.name !== 'builderlab/nav' ) {
			return;
		}
		if ( ! plain( b.attributes.label ) ) {
			add( 'nav-name', 'error', '4.1.2', 'The navigation has no name. Name it so people can tell navigations apart.' );
		}
		const bad = lines( b.attributes.items ).filter( ( l ) => {
			const parts = l.replace( /^- /, '' ).split( '|' );
			return ! ( parts[ 0 ] || '' ).trim() || ( ! ( parts[ 1 ] || '' ).trim() && ! /^- /.test( l ) && false );
		} );
		if ( bad.length ) {
			add( 'nav-label', 'error', '2.4.4', 'A menu link has no text.' );
		}
		const noUrl = lines( b.attributes.items ).filter( ( l ) => ! ( ( l.replace( /^- /, '' ).split( '|' )[ 1 ] || '' ).trim() ) );
		if ( noUrl.length ) {
			add( 'nav-url', 'warning', '2.4.4', 'A menu entry has no address, so it is shown as plain text.' );
		}
	} );

	/* ---- breadcrumbs ---- */
	reg( 'breadcrumbs', ( p ) => Panel( 'Breadcrumbs', [
		text( p, 'label', 'Name of the landmark', 'Default: Breadcrumb.' ),
		text( p, 'home', 'Label of the first link' ),
		h( 'p', null, 'Built from the parent pages of the current page. The last item is the current page.' ),
	] ) );

	/* ---- search ---- */
	reg( 'search', ( p ) => Panel( 'Search', [
		text( p, 'label', 'Label (required)', 'A visible label. Placeholders are not labels.' ),
		text( p, 'buttonText', 'Button text' ),
		text( p, 'placeholder', 'Example text (optional)' ),
	] ) );
	BL.addRule( 'search', ( b, add ) => {
		if ( b.name === 'builderlab/search' && ! plain( b.attributes.label ) ) {
			add( 'search-label', 'error', '3.3.2', 'The search field has no label. It will not be shown on the page.' );
		}
	} );

	/* ---- form ---- */
	const AUTOCOMPLETE = [ '', 'name', 'given-name', 'family-name', 'email', 'tel', 'street-address', 'postal-code', 'organization', 'off' ]
		.map( ( v ) => ( { label: v === '' ? 'None / automatic' : v, value: v } ) );
	const FormEdit = ( p ) => {
		useEffect( () => {
			if ( ! p.attributes.formKey ) {
				p.setAttributes( { formKey: 'f' + Math.random().toString( 36 ).slice( 2, 10 ) } );
			}
		}, [] );
		return Panel( 'Form', [
			h( Repeater, {
				label: 'Form fields', itemLabel: 'Field', addLabel: 'Add field', items: p.attributes.fields,
				blank: { type: 'text', label: '', required: false, options: '', autocomplete: '', help: '' },
				fields: [
					{ key: 'type', label: 'Type', type: 'select', options: [ 'text', 'email', 'tel', 'textarea', 'select', 'checkbox', 'radio' ].map( ( v ) => ( { label: v, value: v } ) ) },
					{ key: 'label', label: 'Label (required)' },
					{ key: 'required', label: 'Required', type: 'toggle' },
					{ key: 'help', label: 'Hint (optional)', help: 'Shown under the label, linked to the field for screen readers.' },
					{ key: 'autocomplete', label: 'Autocomplete (helps people fill in their own data)', type: 'select', options: AUTOCOMPLETE },
					{ key: 'options', label: 'Options (select and radio only)', help: 'Separate with commas.' },
				],
				onChange: set( p, 'fields' ),
			} ),
			text( p, 'submitLabel', 'Submit button text' ),
			text( p, 'successMessage', 'Message after sending' ),
			text( p, 'recipient', 'Send entries to (email)', 'Leave empty to use the site admin email. Entries are also saved in the dashboard.' ),
		] );
	};
	registerBlockType( 'builderlab/form', {
		edit: BL.ssrEdit( 'builderlab/form', FormEdit ),
		save: () => null,
	} );
	BL.addRule( 'form', ( b, add ) => {
		if ( b.name !== 'builderlab/form' ) {
			return;
		}
		const a = b.attributes;
		const fields = a.fields || [];
		if ( ! fields.length ) {
			add( 'form-empty', 'warning', '1.3.1', 'The form has no fields, so it will not be shown.' );
		}
		if ( fields.some( ( f ) => ! plain( f.label ) ) ) {
			add( 'form-label', 'error', '3.3.2', 'A form field has no label. Fields without a label are not shown.' );
		}
		if ( fields.some( ( f ) => /\b(name|e-?mail|phone|tel|address)\b/i.test( f.label || '' ) && ! f.autocomplete && ! [ 'email', 'tel' ].includes( f.type ) ) ) {
			add( 'form-autocomplete', 'warning', '1.3.5', 'A personal-data field has no autocomplete value. Set one so browsers can fill it in.' );
		}
		if ( ! plain( a.submitLabel ) ) {
			add( 'form-submit', 'warning', '4.1.2', 'The submit button has no text. "Send" will be used.' );
		}
	} );
} )( window.wp );
