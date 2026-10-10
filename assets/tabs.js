/* BuilderLab tabs: upgrades server-rendered panels to the W3C tab pattern. Without this script every panel stays visible under its heading. */
( function () {
	'use strict';
	document.querySelectorAll( '[data-bl-tabs]' ).forEach( function ( root ) {
		var panels = Array.prototype.slice.call( root.querySelectorAll( ':scope > .bl-tabs__panel' ) );
		if ( panels.length < 2 ) {
			return;
		}
		var list = document.createElement( 'div' );
		list.className = 'bl-tabs__list';
		list.setAttribute( 'role', 'tablist' );
		var label = root.getAttribute( 'data-label' );
		if ( label ) {
			list.setAttribute( 'aria-label', label );
		}
		var tabs = panels.map( function ( panel, i ) {
			var title = panel.querySelector( '.bl-tabs__title' );
			var tab = document.createElement( 'button' );
			tab.type = 'button';
			tab.className = 'bl-tabs__tab';
			tab.id = panel.id + '-tab';
			tab.setAttribute( 'role', 'tab' );
			tab.setAttribute( 'aria-controls', panel.id );
			tab.textContent = title ? title.textContent : 'Tab ' + ( i + 1 );
			panel.setAttribute( 'role', 'tabpanel' );
			panel.setAttribute( 'aria-labelledby', tab.id );
			panel.setAttribute( 'tabindex', '0' );
			if ( title ) {
				title.className += ' bl-sr-only';
			}
			list.appendChild( tab );
			return tab;
		} );
		root.insertBefore( list, panels[ 0 ] );
		root.classList.add( 'is-enhanced' );

		function select( index, focus ) {
			tabs.forEach( function ( tab, i ) {
				var on = i === index;
				tab.setAttribute( 'aria-selected', on ? 'true' : 'false' );
				tab.tabIndex = on ? 0 : -1;
				panels[ i ].hidden = ! on;
			} );
			if ( focus ) {
				tabs[ index ].focus();
			}
		}
		tabs.forEach( function ( tab, i ) {
			tab.addEventListener( 'click', function () { select( i, false ); } );
			tab.addEventListener( 'keydown', function ( e ) {
				var next = null;
				if ( e.key === 'ArrowRight' ) { next = ( i + 1 ) % tabs.length; }
				if ( e.key === 'ArrowLeft' ) { next = ( i - 1 + tabs.length ) % tabs.length; }
				if ( e.key === 'Home' ) { next = 0; }
				if ( e.key === 'End' ) { next = tabs.length - 1; }
				if ( next !== null ) {
					e.preventDefault();
					select( next, true );
				}
			} );
		} );
		select( 0, false );
	} );
}() );
