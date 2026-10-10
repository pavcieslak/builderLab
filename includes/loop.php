<?php
/**
 * Loop Grid: the post types that can be listed, the fields a card can show, and the card markup.
 */
defined( 'ABSPATH' ) || exit;

/** Post types that may be listed: public ones, not media and not BuilderLab's own. */
function builderlab_loop_post_types() {
	$out = array();
	foreach ( get_post_types( array( 'public' => true ), 'objects' ) as $name => $obj ) {
		if ( 'attachment' === $name || 0 === strpos( $name, 'builderlab_' ) ) {
			continue;
		}
		$out[ $name ] = $obj->labels->name;
	}
	return $out;
}

/** Built-in fields every card can show. */
function builderlab_loop_core_fields() {
	return array(
		'title'    => 'Title',
		'image'    => 'Featured image',
		'excerpt'  => 'Excerpt',
		'date'     => 'Date',
		'author'   => 'Author',
		'terms'    => 'Categories or terms',
		'readmore' => 'Read more link',
	);
}

/** Fields a card item may use: a built-in name, acf:name or meta:name. Anything else is dropped. */
function builderlab_loop_clean_field( $value ) {
	$value = is_scalar( $value ) ? (string) $value : '';
	if ( isset( builderlab_loop_core_fields()[ $value ] ) ) {
		return $value;
	}
	if ( preg_match( '/^(acf|meta):(.+)$/', $value, $m ) ) {
		$name = builderlab_custom_field_name( $m[2] );
		return '' !== $name ? $m[1] . ':' . $name : '';
	}
	return '';
}

/** The first public, hierarchical-or-not taxonomy of a post type, for the "terms" field. */
function builderlab_loop_first_taxonomy( $post_type ) {
	foreach ( get_object_taxonomies( $post_type, 'objects' ) as $tax ) {
		if ( $tax->public && 'post_format' !== $tax->name ) {
			return $tax->name;
		}
	}
	return '';
}

/** One card, as markup. $items is the cleaned card definition. */
function builderlab_loop_card( WP_Post $post, array $items, $level ) {
	$url        = get_permalink( $post );
	$title      = trim( (string) get_the_title( $post ) );
	if ( '' === $title ) {
		$title = '(Untitled)'; // A link or heading with no text has no name for assistive technology.
	}
	$title_link = false;
	foreach ( $items as $it ) {
		if ( 'title' === $it['field'] && $it['link'] ) {
			$title_link = true;
		}
	}
	$html = '';
	foreach ( $items as $it ) {
		$field = $it['field'];
		$link  = $it['link'];
		$text  = $it['text'];
		switch ( $field ) {
			case 'title':
				$inner = esc_html( $title );
				$inner = $link ? '<a href="' . esc_url( $url ) . '">' . $inner . '</a>' : $inner;
				$html .= '<h' . $level . ' class="bl-card__title">' . $inner . '</h' . $level . '>';
				break;
			case 'image':
				if ( ! has_post_thumbnail( $post ) ) {
					break;
				}
				$thumb_id = get_post_thumbnail_id( $post );
				// With a linked title next to it, the picture link would repeat the same link for assistive technology.
				$hide = $link && $title_link;
				$alt  = $hide ? '' : ( trim( (string) get_post_meta( $thumb_id, '_wp_attachment_image_alt', true ) ) ?: ( $link ? $title : '' ) );
				$img  = wp_get_attachment_image( $thumb_id, 'medium_large', false, array( 'alt' => $alt, 'class' => 'bl-image', 'loading' => 'lazy' ) );
				if ( $link ) {
					$img = '<a href="' . esc_url( $url ) . '"' . ( $hide ? ' tabindex="-1" aria-hidden="true"' : '' ) . '>' . $img . '</a>';
				}
				$html .= '<div class="bl-card__image">' . $img . '</div>';
				break;
			case 'excerpt':
				$excerpt = wp_trim_words( get_the_excerpt( $post ), 28 );
				if ( '' !== $excerpt ) {
					$html .= '<p class="bl-card__excerpt">' . esc_html( $excerpt ) . '</p>';
				}
				break;
			case 'date':
				$html .= '<p class="bl-card__meta"><time datetime="' . esc_attr( get_the_date( 'c', $post ) ) . '">' . esc_html( get_the_date( '', $post ) ) . '</time></p>';
				break;
			case 'author':
				$name = get_the_author_meta( 'display_name', $post->post_author );
				if ( '' !== $name ) {
					$html .= '<p class="bl-card__meta">' . esc_html( ( '' !== $text ? $text : 'By' ) . ' ' . $name ) . '</p>';
				}
				break;
			case 'terms':
				$tax   = builderlab_loop_first_taxonomy( $post->post_type );
				$terms = $tax ? get_the_terms( $post, $tax ) : array();
				if ( $terms && ! is_wp_error( $terms ) ) {
					$names = array_map( function ( $t ) {
						return esc_html( $t->name );
					}, $terms );
					$html .= '<p class="bl-card__meta">' . implode( ', ', $names ) . '</p>'; // phpcs:ignore WordPress.Security.EscapeOutput
				}
				break;
			case 'readmore':
				$label = '' !== $text ? $text : 'Read more';
				$html .= '<p class="bl-card__more"><a class="bl-button is-ghost" href="' . esc_url( $url ) . '">' . esc_html( $label ) . '<span class="bl-sr-only">: ' . esc_html( $title ) . '</span></a></p>';
				break;
			default:
				if ( ! preg_match( '/^(acf|meta):(.+)$/', $field, $m ) ) {
					break;
				}
				$value = ( 'acf' === $m[1] && function_exists( 'get_field' ) ) ? get_field( $m[2], $post->ID ) : get_post_meta( $post->ID, $m[2], true );
				if ( is_array( $value ) && isset( $value['url'] ) ) { // An ACF image or file array.
					$value = ! empty( $value['mime_type'] ) && 0 === strpos( $value['mime_type'], 'image/' )
						? '<img class="bl-image" src="' . esc_url( $value['url'] ) . '" alt="' . esc_attr( $value['alt'] ?? '' ) . '" loading="lazy">'
						: '<a href="' . esc_url( $value['url'] ) . '">' . esc_html( $value['title'] ?? $value['filename'] ?? $value['url'] ) . '</a>';
				} elseif ( is_array( $value ) ) {
					$value = implode( ', ', array_map( 'esc_html', array_filter( $value, 'is_scalar' ) ) );
				} elseif ( is_scalar( $value ) ) {
					$value = builderlab_kses( (string) $value );
				} else {
					$value = '';
				}
				if ( '' === trim( $value ) ) {
					break;
				}
				$label = '' !== $text ? '<span class="bl-card__label">' . esc_html( $text ) . ' </span>' : '';
				$html .= '<p class="bl-card__meta">' . $label . $value . '</p>'; // phpcs:ignore WordPress.Security.EscapeOutput
		}
	}
	return '<li class="bl-loop__item"><article class="bl-card">' . $html . '</article></li>';
}

/** Choices for the editor: post types, taxonomies with terms, and the fields of one post type. */
add_action( 'rest_api_init', function () {
	register_rest_route( 'builderlab/v1', '/editor/(?P<id>\d+)/loop-sources', array(
		'methods'             => 'GET',
		'permission_callback' => 'builderlab_rest_can_edit',
		'callback'            => function ( WP_REST_Request $req ) {
			global $wpdb;
			$types = builderlab_loop_post_types();
			$type  = sanitize_key( (string) $req->get_param( 'post_type' ) );
			$type  = isset( $types[ $type ] ) ? $type : 'post';

			$out = array( 'postTypes' => array(), 'taxonomies' => array(), 'terms' => array(), 'fields' => array( 'core' => array(), 'acf' => array(), 'meta' => array() ), 'acfActive' => function_exists( 'acf_get_field_groups' ) );
			foreach ( $types as $name => $label ) {
				$out['postTypes'][] = array( 'name' => $name, 'label' => $label );
			}
			foreach ( get_object_taxonomies( $type, 'objects' ) as $tax ) {
				if ( ! $tax->public || 'post_format' === $tax->name ) {
					continue;
				}
				$out['taxonomies'][] = array( 'name' => $tax->name, 'label' => $tax->labels->name );
				$list = get_terms( array( 'taxonomy' => $tax->name, 'hide_empty' => false, 'number' => 100, 'fields' => 'all' ) );
				foreach ( is_wp_error( $list ) ? array() : $list as $t ) {
					$out['terms'][ $tax->name ][] = array( 'slug' => $t->slug, 'name' => $t->name );
				}
			}
			foreach ( builderlab_loop_core_fields() as $value => $label ) {
				$out['fields']['core'][] = array( 'value' => $value, 'label' => $label );
			}
			if ( $out['acfActive'] ) {
				foreach ( (array) acf_get_field_groups( array( 'post_type' => $type ) ) as $group ) {
					foreach ( (array) acf_get_fields( $group ) as $field ) {
						if ( in_array( $field['type'] ?? '', array( 'group', 'repeater', 'flexible_content', 'tab', 'message', 'accordion', 'clone' ), true ) ) {
							continue;
						}
						$out['fields']['acf'][] = array( 'value' => 'acf:' . $field['name'], 'label' => $field['label'], 'group' => $group['title'] );
					}
				}
			}
			$keys = $wpdb->get_col( $wpdb->prepare(
				"SELECT DISTINCT pm.meta_key FROM {$wpdb->postmeta} pm INNER JOIN {$wpdb->posts} p ON p.ID = pm.post_id WHERE p.post_type = %s AND pm.meta_key NOT LIKE %s ORDER BY pm.meta_key LIMIT 150",
				$type,
				$wpdb->esc_like( '_' ) . '%'
			) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
			foreach ( (array) $keys as $key ) {
				if ( '' !== builderlab_custom_field_name( $key ) ) {
					$out['fields']['meta'][] = array( 'value' => 'meta:' . $key, 'label' => $key );
				}
			}
			return $out;
		},
	) );
} );
