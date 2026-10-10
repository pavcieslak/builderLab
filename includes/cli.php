<?php
/**
 * WP-CLI commands for the design system (development and automation).
 * Usage: wp builderlab ds <command>
 */
defined( 'ABSPATH' ) || exit;

if ( ! defined( 'WP_CLI' ) || ! WP_CLI ) {
	return;
}

class BuilderLab_DS_CLI {

	/** Prints the active design system as JSON. */
	public function show() {
		WP_CLI::line( wp_json_encode( builderlab_ds_get(), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) );
	}

	/**
	 * Writes the design system to a JSON file.
	 *
	 * ## OPTIONS
	 * <file>
	 * : Path of the file to write.
	 */
	public function export( $args ) {
		file_put_contents( $args[0], wp_json_encode( builderlab_ds_get(), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) );
		WP_CLI::success( 'Exported to ' . $args[0] );
	}

	/**
	 * Imports a design system from a JSON file and saves it.
	 *
	 * ## OPTIONS
	 * <file>
	 * : Path of the JSON file.
	 */
	public function import( $args ) {
		$data = json_decode( (string) file_get_contents( $args[0] ), true );
		if ( ! is_array( $data ) ) {
			WP_CLI::error( 'The file is not valid JSON.' );
		}
		$res = builderlab_ds_save( $data, 'Import from file' );
		foreach ( $res['warnings'] as $w ) {
			WP_CLI::warning( $w );
		}
		WP_CLI::success( sprintf( 'Saved. Compiled file: %d bytes, %d warnings.', $res['build']['bytes'], count( $res['warnings'] ) ) );
	}

	/** Prints every checked color pair with its ratio. */
	public function contrast() {
		$rows = array();
		foreach ( builderlab_ds_contrast( builderlab_ds_get() ) as $r ) {
			$rows[] = array(
				'pair'   => $r['foreground'] . ' on ' . $r['background'],
				'colors' => $r['fg'] . ' on ' . $r['bg'],
				'ratio'  => $r['ratio'],
				'needed' => $r['needed'],
				'result' => $r['pass'] ? 'pass' : 'FAIL (warning only)',
			);
		}
		WP_CLI\Utils\format_items( 'table', $rows, array( 'pair', 'colors', 'ratio', 'needed', 'result' ) );
	}

	/** Prints the compiled CSS and its size. */
	public function compile() {
		$css = builderlab_ds_compile( builderlab_ds_get() );
		WP_CLI::line( str_replace( ';', ";\n", $css ) );
		WP_CLI::line( sprintf( '--- %d bytes, %d bytes gzip', strlen( $css ), strlen( gzencode( $css, 9 ) ) ) );
	}

	/** Lists stored revisions. */
	public function revisions() {
		$rows = array();
		foreach ( builderlab_ds_revisions() as $i => $r ) {
			$rows[] = array( 'index' => $i, 'time' => wp_date( 'Y-m-d H:i:s', $r['time'] ), 'note' => $r['note'] );
		}
		WP_CLI\Utils\format_items( 'table', $rows, array( 'index', 'time', 'note' ) );
	}

	/**
	 * Restores a stored revision.
	 *
	 * ## OPTIONS
	 * <index>
	 * : Revision index from the list.
	 */
	public function restore( $args ) {
		$revs = builderlab_ds_revisions();
		$i    = (int) $args[0];
		if ( ! isset( $revs[ $i ] ) ) {
			WP_CLI::error( 'No such revision.' );
		}
		builderlab_ds_save( $revs[ $i ]['data'], 'Restored revision ' . $i );
		WP_CLI::success( 'Restored revision ' . $i );
	}

	/** Resets to the default design system. */
	public function reset() {
		builderlab_ds_save( builderlab_ds_defaults(), 'Reset to defaults' );
		WP_CLI::success( 'Design system reset to defaults.' );
	}
}

WP_CLI::add_command( 'builderlab ds', 'BuilderLab_DS_CLI' );
