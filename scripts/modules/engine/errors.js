/******************************************************************************/
/* ERRORS                                                                     */
/******************************************************************************/

/*
 * Project errors all inherit from `CozyLairsError`, so a single `instanceof`
 * check catches any project-thrown error.
 */

class CozyLairsError extends Error
{
    constructor(message, options)
    {
        super(message, options);
        this.name = this.constructor.name;
    }
}


/* ASSETS *********************************************************************/

class AssetLoadError extends CozyLairsError {}
class ManifestError   extends CozyLairsError {}


/* PERSISTENCE ****************************************************************/

class SaveError extends CozyLairsError {}


/* RENDERING ******************************************************************/

class WebGLUnavailableError extends CozyLairsError {}


/* WORLD **********************************************************************/

class GridBoundsError extends CozyLairsError {}
class PlacementError  extends CozyLairsError {}


export
{
    CozyLairsError,
    AssetLoadError,
    ManifestError,
    SaveError,
    WebGLUnavailableError,
    GridBoundsError,
    PlacementError
};
