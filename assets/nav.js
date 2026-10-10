/* BuilderLab navigation: submenu buttons. Without this script every submenu is visible and every link works. */
( function () {
	'use strict';
	document.querySelectorAll( '[data-bl-nav]' ).forEach( function ( nav ) {
		var buttons = nav.querySelectorAll( '.bl-nav__toggle' );
		if ( ! buttons.length ) {
			return;
		}
		function close( button ) {
			button.setAttribute( 'aria-expanded', 'false' );
			document.getElementById( button.getAttribute( 'aria-controls' ) ).hidden = true;
		}
		buttons.forEach( function ( button ) {
			button.hidden = false;
			close( button );
			button.addEventListener( 'click', function () {
				var open = button.getAttribute( 'aria-expanded' ) === 'true';
				if ( open ) {
					close( button );
				} else {
					button.setAttribute( 'aria-expanded', 'true' );
					document.getElementById( button.getAttribute( 'aria-controls' ) ).hidden = false;
				}
			} );
		} );
		// Escape closes an open submenu and returns focus to its button.
		nav.addEventListener( 'keydown', function ( e ) {
			if ( e.key !== 'Escape' ) {
				return;
			}
			buttons.forEach( function ( button ) {
				if ( button.getAttribute( 'aria-expanded' ) === 'true' ) {
					close( button );
					button.focus();
				}
			} );
		} );
	} );
}() );
