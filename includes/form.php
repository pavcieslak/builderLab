<?php
/**
 * BuilderLab basic form: server-side rendering, validation and handling.
 * No third-party service. Entries are stored as private posts and mailed to the chosen address.
 */
defined( 'ABSPATH' ) || exit;

add_action( 'init', function () {
	register_post_type( 'builderlab_entry', array(
		'labels'          => array( 'name' => 'Form entries', 'singular_name' => 'Form entry' ),
		'public'          => false,
		'show_ui'         => true,
		'show_in_menu'    => 'builderlab-design-system',
		'menu_icon'       => 'dashicons-feedback',
		'supports'        => array( 'title', 'editor' ),
		'capability_type' => 'post',
	) );
} );

function builderlab_field_types() {
	return array( 'text', 'email', 'tel', 'textarea', 'select', 'checkbox', 'radio' );
}

/** Finds a form block by its key inside serialized post content. */
function builderlab_find_form( $blocks, $key ) {
	foreach ( $blocks as $block ) {
		if ( 'builderlab/form' === $block['blockName'] && ( $block['attrs']['formKey'] ?? '' ) === $key ) {
			return $block;
		}
		if ( ! empty( $block['innerBlocks'] ) ) {
			$found = builderlab_find_form( $block['innerBlocks'], $key );
			if ( $found ) {
				return $found;
			}
		}
	}
	return null;
}

/** Field name as sent by the browser. */
function builderlab_field_name( $index ) {
	return 'bl_f_' . (int) $index;
}

function builderlab_split_options( $text ) {
	return array_values( array_filter( array_map( 'trim', explode( ',', (string) $text ) ), 'strlen' ) );
}

/** Validates posted values against the saved block config. Returns array( values, errors ). */
function builderlab_validate_form( array $fields, array $post ) {
	$values = array();
	$errors = array();
	foreach ( $fields as $i => $f ) {
		$type  = in_array( $f['type'] ?? 'text', builderlab_field_types(), true ) ? $f['type'] : 'text';
		$label = trim( (string) ( $f['label'] ?? '' ) );
		$name  = builderlab_field_name( $i );
		$raw   = isset( $post[ $name ] ) ? wp_unslash( $post[ $name ] ) : '';
		if ( is_array( $raw ) ) {
			$raw = '';
		}
		switch ( $type ) {
			case 'email':
				$value = sanitize_email( $raw );
				break;
			case 'textarea':
				$value = sanitize_textarea_field( $raw );
				break;
			case 'checkbox':
				$value = ( '' !== $raw ) ? 'Yes' : '';
				break;
			default:
				$value = sanitize_text_field( $raw );
		}
		if ( in_array( $type, array( 'select', 'radio' ), true ) && '' !== $value && ! in_array( $value, builderlab_split_options( $f['options'] ?? '' ), true ) ) {
			$value = '';
		}
		$values[ $i ] = $value;
		if ( ! empty( $f['required'] ) && '' === $value ) {
			$errors[ $i ] = ( 'checkbox' === $type )
				? sprintf( 'Check "%s" to continue.', $label )
				: sprintf( 'Enter a value for "%s".', $label );
		} elseif ( 'email' === $type && '' !== $raw && ! is_email( $value ) ) {
			$errors[ $i ] = sprintf( 'Enter a valid email address for "%s", for example name@example.com.', $label );
		}
	}
	return array( $values, $errors );
}

function builderlab_form_redirect( $post_id, $key, array $state ) {
	$token = wp_generate_password( 12, false );
	set_transient( 'bl_form_' . $token, $state, 5 * MINUTE_IN_SECONDS );
	$url = add_query_arg( 'bl_form', $token, get_permalink( $post_id ) );
	wp_safe_redirect( $url . '#bl-form-' . $key );
	exit;
}

function builderlab_form_submit() {
	$post_id = (int) ( $_POST['bl_post'] ?? 0 ); // phpcs:ignore WordPress.Security.NonceVerification
	$key     = sanitize_key( $_POST['bl_key'] ?? '' ); // phpcs:ignore WordPress.Security.NonceVerification
	if ( ! isset( $_POST['bl_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['bl_nonce'] ) ), 'builderlab_form_' . $key ) ) {
		wp_die( 'This form could not be verified. Go back, reload the page and try again.', 'Form not verified', array( 'response' => 403 ) );
	}
	$post = get_post( $post_id );
	if ( ! $post || 'publish' !== $post->post_status ) {
		wp_die( 'This form is not available.', 'Form not available', array( 'response' => 404 ) );
	}
	if ( ! empty( $_POST['bl_website'] ) ) { // Honeypot field, hidden from people.
		builderlab_form_redirect( $post_id, $key, array( 'key' => $key, 'ok' => true, 'errors' => array(), 'values' => array() ) );
	}
	$block = builderlab_find_form( parse_blocks( $post->post_content ), $key );
	if ( ! $block ) {
		wp_die( 'This form is not available.', 'Form not available', array( 'response' => 404 ) );
	}
	$attrs  = $block['attrs'];
	$fields = is_array( $attrs['fields'] ?? null ) ? $attrs['fields'] : array();
	list( $values, $errors ) = builderlab_validate_form( $fields, $_POST ); // phpcs:ignore WordPress.Security.NonceVerification
	if ( $errors ) {
		builderlab_form_redirect( $post_id, $key, array( 'key' => $key, 'ok' => false, 'errors' => $errors, 'values' => $values ) );
	}
	$lines = array();
	foreach ( $fields as $i => $f ) {
		$lines[] = trim( (string) ( $f['label'] ?? '' ) ) . ': ' . $values[ $i ];
	}
	$body = implode( "\n", $lines );
	wp_insert_post( array(
		'post_type'    => 'builderlab_entry',
		'post_status'  => 'private',
		'post_title'   => sprintf( 'Entry from "%s" on %s', get_the_title( $post ), wp_date( 'j F Y, H:i' ) ),
		'post_content' => $body,
	) );
	$to = is_email( $attrs['recipient'] ?? '' ) ? $attrs['recipient'] : get_option( 'admin_email' );
	wp_mail( $to, 'New form entry: ' . get_the_title( $post ), $body );
	builderlab_form_redirect( $post_id, $key, array( 'key' => $key, 'ok' => true, 'errors' => array(), 'values' => array() ) );
}
add_action( 'admin_post_nopriv_builderlab_form', 'builderlab_form_submit' );
add_action( 'admin_post_builderlab_form', 'builderlab_form_submit' );

/** Renders the form block. */
function builderlab_render_form( array $attributes ) {
	$key    = sanitize_key( $attributes['formKey'] ?? '' );
	$fields = is_array( $attributes['fields'] ?? null ) ? $attributes['fields'] : array();
	if ( '' === $key || ! $fields ) {
		return '';
	}
	$post_id = (int) get_the_ID();
	$state   = null;
	$token   = isset( $_GET['bl_form'] ) ? sanitize_key( wp_unslash( $_GET['bl_form'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification
	if ( '' !== $token ) {
		$data = get_transient( 'bl_form_' . $token );
		if ( is_array( $data ) && ( $data['key'] ?? '' ) === $key ) {
			$state = $data;
		}
	}
	$anchor = 'bl-form-' . $key;
	$errors = $state['errors'] ?? array();
	$values = $state['values'] ?? array();
	$out    = '';

	if ( $state && ! empty( $state['ok'] ) ) {
		$msg  = trim( (string) ( $attributes['successMessage'] ?? '' ) );
		$msg  = '' !== $msg ? $msg : 'Thank you. Your message was sent.';
		$out .= '<div class="bl-form__success" id="' . esc_attr( $anchor ) . '" role="status" tabindex="-1">' . esc_html( $msg ) . '</div>';
		return sprintf( '<div %s>%s</div>', builderlab_wrapper( 'bl-form', $attributes ), $out );
	}

	$uid = wp_unique_id( 'blf' );
	if ( $errors ) {
		$out .= '<div class="bl-form__errors" id="' . esc_attr( $anchor ) . '" role="alert" tabindex="-1">';
		$out .= '<p class="bl-form__errors-title"><strong>' . esc_html( sprintf( _n( 'There is %d problem with your answers', 'There are %d problems with your answers', count( $errors ), 'builderlab' ), count( $errors ) ) ) . '</strong></p><ul>';
		foreach ( $errors as $i => $message ) {
			$target = $uid . '-' . (int) $i;
			$out   .= '<li><a href="#' . esc_attr( $target ) . '">' . esc_html( $message ) . '</a></li>';
		}
		$out .= '</ul></div>';
	}

	$out .= '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" novalidate>';
	$out .= '<input type="hidden" name="action" value="builderlab_form">';
	$out .= '<input type="hidden" name="bl_post" value="' . esc_attr( $post_id ) . '">';
	$out .= '<input type="hidden" name="bl_key" value="' . esc_attr( $key ) . '">';
	$out .= '<input type="hidden" name="bl_nonce" value="' . esc_attr( wp_create_nonce( 'builderlab_form_' . $key ) ) . '">';
	$out .= '<div class="bl-form__trap" aria-hidden="true"><label>Leave this field empty<input type="text" name="bl_website" tabindex="-1" autocomplete="off"></label></div>';

	foreach ( $fields as $i => $f ) {
		$type  = in_array( $f['type'] ?? 'text', builderlab_field_types(), true ) ? $f['type'] : 'text';
		$label = trim( (string) ( $f['label'] ?? '' ) );
		if ( '' === $label ) {
			continue;
		}
		$id    = $uid . '-' . (int) $i;
		$name  = builderlab_field_name( $i );
		$req   = ! empty( $f['required'] );
		$help  = trim( (string) ( $f['help'] ?? '' ) );
		$auto  = preg_replace( '/[^a-z-]/', '', strtolower( (string) ( $f['autocomplete'] ?? '' ) ) );
		if ( '' === $auto ) {
			$auto = ( 'email' === $type ) ? 'email' : ( ( 'tel' === $type ) ? 'tel' : '' );
		}
		$val   = (string) ( $values[ $i ] ?? '' );
		$err   = $errors[ $i ] ?? '';
		$desc  = array();
		if ( '' !== $help ) {
			$desc[] = $id . '-help';
		}
		if ( '' !== $err ) {
			$desc[] = $id . '-error';
		}
		$common = ( $desc ? ' aria-describedby="' . esc_attr( implode( ' ', $desc ) ) . '"' : '' )
			. ( $req ? ' required aria-required="true"' : '' )
			. ( '' !== $err ? ' aria-invalid="true"' : '' )
			. ( ( '' !== $auto && 'off' !== $auto ) ? ' autocomplete="' . esc_attr( $auto ) . '"' : ( 'off' === $auto ? ' autocomplete="off"' : '' ) );
		$mark   = $req ? ' <span class="bl-field__req">(required)</span>' : '';
		$helpHtml = ( '' !== $help ) ? '<p class="bl-field__help" id="' . esc_attr( $id . '-help' ) . '">' . esc_html( $help ) . '</p>' : '';
		$errHtml  = ( '' !== $err ) ? '<p class="bl-field__error" id="' . esc_attr( $id . '-error' ) . '"><span class="bl-sr-only">Error: </span>' . esc_html( $err ) . '</p>' : '';

		$out .= '<div class="bl-field' . ( '' !== $err ? ' has-error' : '' ) . '">';
		if ( 'radio' === $type ) {
			$out .= '<fieldset id="' . esc_attr( $id ) . '"' . ( $desc ? ' aria-describedby="' . esc_attr( implode( ' ', $desc ) ) . '"' : '' ) . '><legend>' . esc_html( $label ) . $mark . '</legend>' . $helpHtml;
			foreach ( builderlab_split_options( $f['options'] ?? '' ) as $n => $opt ) {
				$oid  = $id . '-o' . $n;
				$out .= '<div class="bl-choice"><input type="radio" id="' . esc_attr( $oid ) . '" name="' . esc_attr( $name ) . '" value="' . esc_attr( $opt ) . '"' . ( $val === $opt ? ' checked' : '' ) . ( $req && 0 === $n ? ' required' : '' ) . '> <label for="' . esc_attr( $oid ) . '">' . esc_html( $opt ) . '</label></div>';
			}
			$out .= $errHtml . '</fieldset>';
		} elseif ( 'checkbox' === $type ) {
			$out .= $helpHtml . '<div class="bl-choice"><input type="checkbox" id="' . esc_attr( $id ) . '" name="' . esc_attr( $name ) . '" value="1"' . ( '' !== $val ? ' checked' : '' ) . $common . '> <label for="' . esc_attr( $id ) . '">' . esc_html( $label ) . $mark . '</label></div>' . $errHtml;
		} else {
			$out .= '<label for="' . esc_attr( $id ) . '">' . esc_html( $label ) . $mark . '</label>' . $helpHtml;
			if ( 'textarea' === $type ) {
				$out .= '<textarea id="' . esc_attr( $id ) . '" name="' . esc_attr( $name ) . '" rows="5"' . $common . '>' . esc_textarea( $val ) . '</textarea>';
			} elseif ( 'select' === $type ) {
				$out .= '<select id="' . esc_attr( $id ) . '" name="' . esc_attr( $name ) . '"' . $common . '><option value="">Choose an option</option>';
				foreach ( builderlab_split_options( $f['options'] ?? '' ) as $opt ) {
					$out .= '<option value="' . esc_attr( $opt ) . '"' . selected( $val, $opt, false ) . '>' . esc_html( $opt ) . '</option>';
				}
				$out .= '</select>';
			} else {
				$html_type = ( 'email' === $type ) ? 'email' : ( ( 'tel' === $type ) ? 'tel' : 'text' );
				$out      .= '<input type="' . esc_attr( $html_type ) . '" id="' . esc_attr( $id ) . '" name="' . esc_attr( $name ) . '" value="' . esc_attr( $val ) . '"' . $common . '>';
			}
			$out .= $errHtml;
		}
		$out .= '</div>';
	}
	$submit = trim( (string) ( $attributes['submitLabel'] ?? '' ) );
	$out   .= '<button type="submit" class="bl-button">' . esc_html( '' !== $submit ? $submit : 'Send' ) . '</button></form>';
	return sprintf( '<div %s>%s</div>', builderlab_wrapper( 'bl-form', $attributes ), $out );
}
