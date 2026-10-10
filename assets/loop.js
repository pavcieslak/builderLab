/* Loop grid: load another page of results in place. Links stay real links, so without this script they still work. */
( function () {
	var q = function ( key ) { return document.querySelector( '.bl-loop[data-bl-key="' + key + '"]' ); };

	function load( url, key, push ) {
		var box = q( key );
		if ( ! box ) { return; }
		box.setAttribute( 'aria-busy', 'true' );
		fetch( url, { credentials: 'same-origin' } )
			.then( function ( r ) { if ( ! r.ok ) { throw new Error( 'bad' ); } return r.text(); } )
			.then( function ( html ) {
				var doc = new DOMParser().parseFromString( html, 'text/html' );
				var fresh = doc.querySelector( '.bl-loop[data-bl-key="' + key + '"] .bl-loop__body' );
				var body = box.querySelector( '.bl-loop__body' );
				if ( ! fresh || ! body ) { throw new Error( 'missing' ); }
				body.innerHTML = fresh.innerHTML;
				if ( push ) { history.pushState( { blLoop: key }, '', url ); }
				box.removeAttribute( 'aria-busy' );
				body.setAttribute( 'tabindex', '-1' );
				body.focus();
				var cur = ( body.querySelector( '[aria-current="page"]' ) || body.querySelector( 'span.page-numbers:not(.dots)' ) );
				var text = cur ? cur.textContent.trim() : '';
				var live = box.querySelector( '[role="status"]' );
				if ( live ) { live.textContent = ( text ? ( /^Page/.test( text ) ? text : 'Page ' + text ) : 'Page' ) + ' loaded.'; }
			} )
			.catch( function () { window.location.href = url; } );
	}

	document.addEventListener( 'click', function ( e ) {
		var a = e.target.closest ? e.target.closest( '.bl-loop[data-bl-ajax] .bl-pagination a' ) : null;
		if ( ! a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey ) { return; }
		e.preventDefault();
		load( a.href, a.closest( '.bl-loop' ).getAttribute( 'data-bl-key' ), true );
	} );

	window.addEventListener( 'popstate', function () {
		document.querySelectorAll( '.bl-loop[data-bl-ajax]' ).forEach( function ( b ) { load( window.location.href, b.getAttribute( 'data-bl-key' ), false ); } );
	} );
}() );
