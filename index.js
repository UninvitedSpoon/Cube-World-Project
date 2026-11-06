
const canvas = document.getElementById("c");
const gl = canvas.getContext("webgl", { alpha: false });

if (!gl) throw new Error("WebGL is not supported.");

// ------------------------------------------------------------------------------------------------------
// Section 1: Shader Compilation

// Compiles WebGL shader and reports compilation errors.
// param:
// type = gl.VERTEX_SHADER or gl.FRAGMENT_SHADER; source = GLSL source code
// returns:
// a compiled WebGLShader
function compileShader(type, source)
{
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
    {
        throw new Error(gl.getShaderInfoLog(shader));
    }

    return shader;
}

// Links vertex and fragment shaders into WebGL program.
// param:
// vertexSource = vertex GLSL; fragmentSource = fragment GLSL
// returns:
// a linked WebGLProgram
function createProgram(vertexSource, fragmentSource)
{
    const p = gl.createProgram();

    gl.attachShader(p, compileShader(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(p, compileShader(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(p);

    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    {
        throw new Error(gl.getProgramInfoLog(p));
    }

    return p;
}

// ------------------------------------------------------------------------------------------------------
// Section 2: Home Page Shaders

const vertexShaderSource = 
`
attribute vec3 aPosition;
attribute vec3 aNormal;

uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProjection;

varying vec3 vNormal;

void main()
{
    vNormal = normalize(mat3(uModel) * aNormal);
    gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);
}
`;

const fragmentShaderSource = 
`
precision mediump float;

uniform vec3 uColor;
varying vec3 vNormal;

void main()
{
    vec3 lightDirection = normalize(vec3(0.5, 1.0, 0.3));
    float brightness = max(dot(normalize(vNormal), lightDirection), 0.0);
    float light = 0.3 + 0.7 * brightness;

    gl_FragColor = vec4(uColor * light, 1.0);
}
`;

const program = createProgram
(
    vertexShaderSource,
    fragmentShaderSource
);

// ------------------------------------------------------------------------------------------------------
// Section 3: Cube Geometry

// Each vertex contains:
// x, y, z, normalX, normalY, normalZ

const cubeVertices = new Float32Array
([
    // Front
    -0.5,0,0.5, 0,0,1,
     0.5,0,0.5, 0,0,1,
     0.5,1,0.5, 0,0,1,
    -0.5,0,0.5, 0,0,1,
     0.5,1,0.5, 0,0,1,
    -0.5,1,0.5, 0,0,1,

    // Back
    -0.5,0,-0.5, 0,0,-1,
     0.5,1,-0.5, 0,0,-1,
     0.5,0,-0.5, 0,0,-1,
    -0.5,0,-0.5, 0,0,-1,
    -0.5,1,-0.5, 0,0,-1,
     0.5,1,-0.5, 0,0,-1,

    // Top
    -0.5,1,-0.5, 0,1,0,
    -0.5,1,0.5, 0,1,0,
     0.5,1,0.5, 0,1,0,
    -0.5,1,-0.5, 0,1,0,
     0.5,1,0.5, 0,1,0,
     0.5,1,-0.5, 0,1,0,

    // Bottom
    -0.5,0,-0.5, 0,-1,0,
     0.5,0,0.5, 0,-1,0,
    -0.5,0,0.5, 0,-1,0,
    -0.5,0,-0.5, 0,-1,0,
     0.5,0,-0.5, 0,-1,0,
     0.5,0,0.5, 0,-1,0,

    // Right
     0.5,0,-0.5, 1,0,0,
     0.5,1,-0.5, 1,0,0,
     0.5,1,0.5, 1,0,0,
     0.5,0,-0.5, 1,0,0,
     0.5,1,0.5, 1,0,0,
     0.5,0,0.5, 1,0,0,

    // Left
    -0.5,0,-0.5, -1,0,0,
    -0.5,1,0.5, -1,0,0,
    -0.5,1,-0.5, -1,0,0,
    -0.5,0,-0.5, -1,0,0,
    -0.5,0,0.5, -1,0,0,
    -0.5,1,0.5, -1,0,0
]);

const VERTEX_COUNT = 36;

const buffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
gl.bufferData(gl.ARRAY_BUFFER, cubeVertices, gl.STATIC_DRAW);

const aPosition = gl.getAttribLocation(program, "aPosition");
const aNormal = gl.getAttribLocation(program, "aNormal");

const uModel = gl.getUniformLocation(program, "uModel");
const uView = gl.getUniformLocation(program, "uView");
const uProjection = gl.getUniformLocation(program, "uProjection");
const uColor = gl.getUniformLocation(program, "uColor");

// ------------------------------------------------------------------------------------------------------
// Section 4: Application State

let currentPage = "home";

const settings = 
{
    skyscape: false,
    skybox: false,
    manualCamera: false
};

// Terrain settings
const GRID_SIZE = 320;
const CHUNK_SIZE = 16;
const SEA_LEVEL = 5;

let terrainChunks = [];

// For level 2, image data world
let imageChunks = [];
let imageWorldReady = false;

let terrainType = "";
let terrainSeed = 0;

// Camera settings
let orbitAngle = 0.7;
let orbitPitch = 0.55;
let orbitRadius = 180;

let dragging = false;
let lastMouseX = 0;
let lastMouseY = 0;
let lastFrameTime = 0;

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = t => t * t * (3 - 2 * t);

// ------------------------------------------------------------------------------------------------------
// Section 5: Procedural Noise

// Predetermined random-esk value from X, Z and a seed.
// Produces repeatable random-esk noise for coordinates.
// param:
// x, z = grid coordinates; seed = random seed
// returns:
// a normalized random-esk value
function hash2(x, z, seed)
{
    let n = Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed, 1442695041);
    n = Math.imul(n ^ (n >>> 13), 1274126177);

    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

// Smooths noise.
// Interpolates predetermined noise across the terrain plane.
// param:
// x, z = sample coordinates; seed = random seed
// returns:
// a smooth noise value
function noise2(x, z, seed)
{
    const ix = Math.floor(x);
    const iz = Math.floor(z);

    const fx = smooth(x - ix);
    const fz = smooth(z - iz);

    const a = hash2(ix, iz, seed);
    const b = hash2(ix + 1, iz, seed);
    const c = hash2(ix, iz + 1, seed);
    const d = hash2(ix + 1, iz + 1, seed);

    return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
}

// Combines multiple frequencies of noise.
// Combines noise octaves to form natural terrain variation.
// param:
// x, z = sample coordinates; seed = random seed
// returns:
// a layered noise value
function fbm(x, z, seed)
{
    let sum = 0;
    let amplitude = 0.5;
    let frequency = 1;

    for (let i = 0; i < 5; i++)
    {
        sum += amplitude * noise2(x * frequency, z * frequency, seed + i * 29);
        frequency *= 2;
        amplitude *= 0.5;
    }

    return sum / 0.96875;
}

// ------------------------------------------------------------------------------------------------------
// Section 6: Terrain Height Generation

// Smoothly interpolates between two bounds.
// param:
// a, b = interval bounds; value = sample
// returns:
// an interpolation weight from 0 to 1
function smoothstep(a, b, value)
{
    const t = clamp((value - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
}

// Linearly interpolates between two values.
// param:
// a, b = endpoints; t = interpolation weight
// returns:
// the interpolated value
function mix(a, b, t)
{
    return a * (1 - t) + b * t;
}

// Shapes noise into sharper mountain ridges.
// param:
// x, z = sample coordinates; seed = random seed
// returns:
// a ridge-shaped noise value
function ridgeNoise(x, z, seed)
{
    return 1 - Math.abs(fbm(x, z, seed) * 2 - 1);
}

// Random settings chosen once for each generated world.
let worldFeatures = {};

// Chooses the randomized geographic features used by the current terrain.
// param:
// none
// returns:
// none; updates world feature state
function GenerateWorldFeatures()
{
    // Random angle around the central mountain.
    const lakeAngle = Math.random() * Math.PI * 2;

    // Position the lake in the foothills,
    // outside the main mountain slopes.
    const lakeRadius = 48 + Math.random() * 12;

    worldFeatures = 
    {
        hasAlpineLake: Math.random() < 0.45,
        hasGlacier: Math.random() < 0.35,
        hasMountainLake: Math.random() < 0.65,
        hasRiver: Math.random() < 0.8,

        lakeX: Math.cos(lakeAngle) * lakeRadius,
        lakeZ: Math.sin(lakeAngle) * lakeRadius,

        riverOffset: (Math.random() - 0.5) * 24,

        forestSeed: Math.floor(Math.random() * 100000)
    };
}

// Coordinates in terrain space.
// Maps grid coordinates into the procedural terrain coordinate space.
// param:
// x, z = grid coordinates
// returns:
// terrain space coordinates
function terrainCoordinates(x, z)
{
    const scale = 128 / GRID_SIZE;
    return [x * scale, z * scale];
}

// Computes the centerline of a river.
// param:
// Z = terrain depth; seed = random seed; offset = lateral offset
// returns:
// river center X coordinate
function riverCenter(Z, seed, offset = 0)
{
    return offset + Math.sin(Z * 0.045 + seed * 0.01) * 20 + Math.sin(Z * 0.105 + seed * 0.003) * 9 + Math.sin(Z * 0.23 + seed * 0.007) * 2.5;
}

// Measures distance to the river centerline.
// param:
// X, Z = terrain coordinates; seed = random seed; offset = lateral offset
// returns:
// distance from the river
function riverDistance(X, Z, seed, offset = 0)
{
    return Math.abs(X - riverCenter(Z, seed, offset));
}

// Lake footprint, from 0 to 1.
// Measures whether a terrain point falls within a lake region.
// param:
// X, Z = sample position; cx, cz = lake center; rx, rz = radii
// returns:
// lake influence value
function lakeMask(X, Z, cx, cz, rx, rz)
{
    const d = Math.hypot((X - cx) / rx, (Z - cz) / rz);

    return 1 - smoothstep(0.65, 1.15, d);
}

// Calculates terrain elevation for the selected landscape type.
// param:
// x, z = grid coordinates; type = landscape type; seed = random seed
// returns:
// terrain elevation
function terrainHeight(x, z, type, seed)
{
    const [X, Z] = terrainCoordinates(x, z);

    const largeNoise = fbm(X * 0.018, Z * 0.018, seed);
    const mediumNoise = fbm(X * 0.065, Z * 0.065, seed + 100);
    const fineNoise = fbm(X * 0.22, Z * 0.22, seed + 200);

    // --------------------------------------------------------
    // Sole Mountain Type
    if (type === "Sole Mountain")
    {
        const eccentric = 0.85 + hash2(3, 8, seed) * 0.3;
        const angle = Math.atan2(Z, X);
        const ridges = Math.sin(angle * 7 + largeNoise * 5) * 0.10 + Math.sin(angle * 13 + mediumNoise * 4) * 0.045;
        const distance = Math.hypot(X * eccentric, Z / eccentric);
        const radius = 43 + hash2(5, 6, seed) * 12;
        const cone = Math.max(0, 1 - distance * (1 + ridges) / radius);
        const steepness = 1.1 + hash2(4, 9, seed) * 0.7;
        const mountain = Math.pow(cone, steepness);

        // Rolling foothills around the mountain.
        const foothills = 9 + largeNoise * 8 + mediumNoise * 4;

        const rockDetail = (mediumNoise - 0.5) * 10 + (fineNoise - 0.5) * 3;

        let height = foothills + mountain * 65 + rockDetail * mountain;

        // Optional river through low terrain.
        if (worldFeatures.hasRiver)
        {
            const distanceToRiver = riverDistance(X, Z, seed, worldFeatures.riverOffset);
            const channel = 1 - smoothstep(1.2, 5.5, distanceToRiver);
            const lowland = 1 - smoothstep(14, 38, height);

            height -= channel * lowland * 7;
        }

        // Optional foothill lake.
        if (worldFeatures.hasMountainLake)
        {
            const mask = lakeMask(X, Z, worldFeatures.lakeX, worldFeatures.lakeZ, 10, 7);

            height = mix(height, Math.min(height, 8), mask);
        }

        return Math.max(6, height);
    }

    // --------------------------------------------------------
    // Mountain Range Type
    if (type === "Mountain Range")
    {
        const angle = hash2(2, 4, seed) * Math.PI;
        const along = X * Math.cos(angle) + Z * Math.sin(angle);
        const across = -X * Math.sin(angle) + Z * Math.cos(angle);
        const warp = (largeNoise - 0.5) * 22 + (mediumNoise - 0.5) * 7;
        const warpedAcross = across + warp;

        // Broad mountain belt fades into foothills.
        const belt = Math.exp(-Math.pow(warpedAcross / 47, 2));
        const foothillMask = smoothstep(0.04, 0.75, belt);

        // Interconnected ridgelines.
        const ridge1 = Math.exp(-Math.pow(warpedAcross / 22, 2));
        const ridge2 = Math.exp(-Math.pow((warpedAcross - 26) / 25, 2));
        const ridge3 = Math.exp(-Math.pow((warpedAcross + 29) / 26, 2));
        const ridgeField = ridge1 * 0.55 + ridge2 * 0.38 + ridge3 * 0.40;

        // Broad variation creates valleys and saddles.
        const saddleNoise = fbm(along * 0.035, warpedAcross * 0.035, seed + 700);
        const saddleHeight = mix(0.45, 1.0, saddleNoise);
        const peakNoise = ridgeNoise(along * 0.085, warpedAcross * 0.055, seed + 710);
        const peaks = Math.pow(peakNoise, 1.7);
        const rockDetail = (mediumNoise - 0.5) * 6 + (fineNoise - 0.5) * 2.5;
        const foothills = 7 + largeNoise * 7 + mediumNoise * 3;

        // Main interconnected mountain ridges.
        const mountains = ridgeField * (24 + saddleHeight * 15 + peaks * 19);

        // Add several prominent summits throughout the range.
        // Their positions are pre-determined for each terrain seed.
        let prominentPeaks = 0;

        const peakCount = 9;

        for (let i = 0; i < peakCount; i++)
        {
            // Position peaks along the mountain belt.
            const peakAlong = (hash2(i, 20, seed) - 0.5) * 115;
            const peakAcross = (hash2(i, 21, seed) - 0.5) * 55;
            const peakHeight = 12 + hash2(i, 22, seed) * 20;
            const peakWidth = 5 + hash2(i, 23, seed) * 6;
            const distance = Math.hypot((along - peakAlong) / peakWidth, (warpedAcross - peakAcross) / peakWidth);

            // Steep summit with a broad lower shoulder.
            const summit = Math.exp(-distance * distance * 1.8);
            const shoulder = Math.exp(-distance * distance * 0.35);

            const peak = peakHeight * (summit * 0.7 + shoulder * 0.3);

            prominentPeaks = Math.max(prominentPeaks, peak);
        }

        let height = foothills + foothillMask * (mountains + rockDetail + prominentPeaks);

        // Occasional alpine lake basin.
        if (worldFeatures.hasAlpineLake)
        {
            const mask = lakeMask(X, Z, worldFeatures.lakeX, worldFeatures.lakeZ, 12, 8);
            height = mix(height, Math.min(height, 19), mask);
        }

        return Math.max(6, height);
    }

    // --------------------------------------------------------
    // Gorge / Canyon Type

    const plateau = 26 + largeNoise * 8 + mediumNoise * 3;
    const distanceToRiver = riverDistance(X, Z, seed);

    // Allow the canyon width to vary along its length.
    const widthNoise = fbm(Z * 0.025, 0.5, seed + 820);
    const gorgeWidth = 9 + widthNoise * 5;

    // River floor is gently sloped downstream.
    const riverFloor = 7.5 + Z * 0.012;

    // Flat inner channel.
    const channelMask = 1 - smoothstep(2.0, 4.0, distanceToRiver);

    // Steep cliff walls with a rounded upper edge.
    const cliffTransition = smoothstep(gorgeWidth * 0.48, gorgeWidth * 1.35, distanceToRiver);

    // Plateau blends into the canyon floor.
    let height = mix(riverFloor, plateau, cliffTransition);

    // Cut the river channel slightly below the valley floor.
    height -= channelMask * 1.6;

    // Small tributary ravines in the upper plateau.
    const tributaries = Math.pow(ridgeNoise(X * 0.045, Z * 0.045, seed + 800), 6) * 5 * cliffTransition;

    // Add rock variation mostly to the cliffs.
    const cliffDetail = (mediumNoise - 0.5) * 2.5 + (fineNoise - 0.5) * 0.8;
    const cliffMask = smoothstep(0.08, 0.35, cliffTransition) * (1 - smoothstep(0.75, 1.0, cliffTransition));

    height -= tributaries;
    height += cliffDetail * cliffMask;

    // Small rolling variations on the plateau.
    height += (mediumNoise - 0.5) * 2.0 * cliffTransition;

    return Math.max(5.2, height);
}

// ------------------------------------------------------------------------------------------------------
// Section 7: Terrain Colors And Forest Canopy

// Blends two RGB colors.
// param:
// a, b = RGB colors; t = blend weight
// returns:
// interpolated RGB color
function blendColors(a, b, t)
{
    t = clamp(t, 0, 1);

    return [a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t, a[2] * (1 - t) + b[2] * t];
}

// Determines where canopy-colored terrain should appear.
// param:
// x, z = position; height = elevation; slope = gradient; type = terrain type; seed = random seed
// returns:
// canopy coverage and rise information
function forestCanopy(x, z, height, slope, type, seed)
{

    if (height <= SEA_LEVEL + 0.5)
    {
        return { rise: 0, coverage: 0 };
    }

    // Avoid growing forest on near-vertical cliffs.
    if (slope > 3.5)
    {
        return { rise: 0, coverage: 0 };
    }

    if (type === "Mountain Range" && height > 24)
    {
        return { rise: 0, coverage: 0 };
    }

    if (type === "Sole Mountain" && height > 30)
    {
        return { rise: 0, coverage: 0 };
    }

    const [X, Z] = terrainCoordinates(x, z);
    const forestNoise = fbm(X * 0.11, Z * 0.11, seed + worldFeatures.forestSeed);
    const detail = fbm(X * 0.35, Z * 0.35, seed + 950);
    let threshold = type === "Gorge / Canyon" ? 0.32 : 0.49;
    let densityBoost = 0;

    if (type === "Gorge / Canyon")
    {
        const distance = riverDistance(X, Z, seed);

        // Encourage trees on the lower valley floor.
        const valleyFactor = 1 - smoothstep(10, 24, height);

        // Avoid the immediate river channel.
        const riverBankFactor = smoothstep(2.5, 6.0, distance);

        densityBoost = valleyFactor * riverBankFactor * 0.18;
    }

    const coverage = smoothstep(threshold, threshold + 0.18, forestNoise + (detail - 0.5) * 0.12 + densityBoost);

    // Reduced coverage on steeper terrain.
    const slopeFactor = 1 - smoothstep(1.5, 3.5, slope);
    const finalCoverage = coverage * slopeFactor;
    const rise = finalCoverage * (0.5 + detail * 1.1);

    return {
        rise: rise,
        coverage: finalCoverage
    };
}

// Assigns terrain RGB colors from elevation, biome and surface conditions.
// param:
// y = elevation; type = terrain type; seed = seed; x, z = position; coverage = canopy amount; water, glacier = surface flags
// returns:
// an RGB color
function elevationColor
(
    y, type, seed, x, z,
    coverage = 0,
    water = false,
    glacier = false
)
{
    const broadNoise = fbm(x * 0.035, z * 0.035, seed + 400);
    const detailNoise = fbm(x * 0.18, z * 0.18, seed + 500);
    const fineNoise = hash2(x, z, seed + 600);

    const grass = [0.24, 0.43, 0.18];
    const darkGrass = [0.14, 0.30, 0.14];
    const forest = [0.065, 0.23, 0.085];

    const stone = [0.43, 0.41, 0.37];
    const lightStone = [0.60, 0.57, 0.52];
    const snow = [0.91, 0.93, 0.94];

    if (water || y <= SEA_LEVEL + 0.01)
    {
        return blendColors([0.025, 0.18, 0.32], [0.04, 0.48, 0.58], broadNoise);
    }

    if (glacier)
    {
        return blendColors([0.52, 0.73, 0.78], [0.85, 0.91, 0.94], detailNoise);
    }

    let color;

    if (type === "Gorge / Canyon")
    {
        // Sandstone and green plateau.
        const sandstone = [0.49, 0.39, 0.29];
        const lightSandstone = [0.62, 0.51, 0.39];

        if (y < 13)
        {
            color = grass;
        }
        else if (y < 21)
        {
            color = blendColors(sandstone, lightSandstone, detailNoise);
        }
        else
        {
            color = blendColors(grass, darkGrass, broadNoise);
        }
    }
    else
    {
        const adjustedHeight = y + (broadNoise - 0.5) * 7 + (detailNoise - 0.5) * 3;
        const snowStart = type === "Mountain Range" ? 70 : 55;

        if (adjustedHeight < 13)
        {
            color = blendColors(grass, darkGrass, broadNoise);
        }
        else if (adjustedHeight < 24)
        {
            color = blendColors(darkGrass, stone, (adjustedHeight - 13) / 11);
        }
        else if (adjustedHeight < snowStart)
        {
            color = blendColors(stone, lightStone, detailNoise * 0.65);
        }
        else
        {
            const snowAmount = clamp((adjustedHeight - snowStart) / 9 + (detailNoise - 0.5) * 0.5, 0, 1);
            color = blendColors(lightStone, snow, snowAmount);
        }
    }

    // Forest patches darken the existing terrain.
    if (coverage > 0)
    {
        const canopyColor = blendColors(forest, darkGrass, detailNoise * 0.45);
        color = blendColors(color, canopyColor, coverage * 0.9);
    }

    const variation = 0.88 + broadNoise * 0.12 + detailNoise * 0.10 + fineNoise * 0.08;

    return color.map(value => clamp(value * variation, 0, 1));
}

// ------------------------------------------------------------------------------------------------------
// Section 8: Chunk Geometry Generation

// Releases procedural terrain buffers from GPU memory.
// param:
// none
// returns:
// none
function disposeTerrain()
{
    for (const chunk of terrainChunks)
    {
        gl.deleteBuffer(chunk.buffer);
    }

    terrainChunks = [];
}

// Each vertex: position XYZ, normal XYZ, color RGB.
// Adds a four-corner face as two triangles to a vertex array.
// param:
// data = vertex array; corners = four 3D positions; normal = face normal; colors = corner RGB values
// returns:
// none; appends vertices to data
function addQuad(data, corners, normal, colors)
{
    const indices = [0, 1, 2, 0, 2, 3];

    for (const i of indices)
    {
        data.push(...corners[i], ...normal, ...colors[i]);
    }
}

// Add a rectangular rock ledge using cube geometry.
// Adds a rectangular sandstone ledge to the terrain for gorge type.
// param:
// data = vertex array; x0,y0,z0 and x1,y1,z1 = box bounds; color = RGB color
// returns:
// none; appends cube faces
function addRockBox(data, x0, y0, z0, x1, y1, z1, color)
{
    const c = [color, color, color, color];

    // Top
    addQuad(data, [[x0,y1,z0], [x0,y1,z1], [x1,y1,z1], [x1,y1,z0]], [0,1,0], c);

    // Bottom
    addQuad(data, [[x0,y0,z1], [x0,y0,z0], [x1,y0,z0], [x1,y0,z1]], [0,-1,0], c);

    // Front
    addQuad(data, [[x0,y0,z1], [x1,y0,z1], [x1,y1,z1], [x0,y1,z1]], [0,0,1], c);

    // Back
    addQuad(data, [[x1,y0,z0], [x0,y0,z0], [x0,y1,z0], [x1,y1,z0]], [0,0,-1], c);

    // Right
    addQuad(data, [[x1,y0,z1], [x1,y0,z0], [x1,y1,z0], [x1,y1,z1]], [1,0,0], c);

    // Left
    addQuad(data, [[x0,y0,z0], [x0,y0,z1], [x0,y1,z1], [x0,y1,z0]], [-1,0,0], c);
}

// Generate the landscape.
// Builds a complete random landscape in chunked GPU buffers.
// param:
// none
// returns:
// none; updates terrainChunks and world state
function GenerateProceduralWorld()
{
    disposeTerrain();

    const types = 
    [
        "Sole Mountain",
        "Mountain Range",
        "Gorge / Canyon"
    ];

    terrainSeed = Math.floor(Math.random() * 1000000);
    terrainType = types[Math.floor(Math.random() * types.length)];

    GenerateWorldFeatures();

    const N = GRID_SIZE;
    const half = N / 2;
    const count = N * N;

    const heights = new Float32Array(count);
    const coverageMap = new Float32Array(count);
    const waterMap = new Uint8Array(count);
    const waterHeights = new Float32Array(count);
    const glacierMap = new Uint8Array(count);

    const index = (x, z) => z * N + x;

    const heightAt = (x, z) => {
        if (x < 0 || z < 0 || x >= N || z >= N)
        {
            return 0;
        }
        return heights[index(x, z)];
    };

    // --------------------------------------------------------
    // Generate basic terrain elevations.
    for (let z = 0; z < N; z++)
    {
        for (let x = 0; x < N; x++)
        {
            const h = terrainHeight(x - half, z - half, terrainType, terrainSeed);

            heights[index(x, z)] = Math.max(5.2, h);
        }
    }

    // --------------------------------------------------------
    // Determine water surfaces without changing terrain.
    for (let z = 0; z < N; z++)
    {
        for (let x = 0; x < N; x++)
        {
            const i = index(x, z);

            const [X, Z] = terrainCoordinates(x - half, z - half);

            let waterLevel = 0;
            let insideWater = false;

            // Gorge river.
            if (terrainType === "Gorge / Canyon")
            {
                const distance = riverDistance(X, Z, terrainSeed);
                const riverFloor = 7.5 + Z * 0.012;

                if (distance < 2.1)
                {
                    waterLevel = riverFloor - 0.65;
                    insideWater = true;
                }
            }

            // Alpine lake.
            else if (terrainType === "Mountain Range")
            {
                if (worldFeatures.hasAlpineLake)
                {
                    const mask = lakeMask(X, Z, worldFeatures.lakeX, worldFeatures.lakeZ, 12, 8);

                    if (mask > 0.88)
                    {
                        waterLevel = 19.35;
                        insideWater = true;
                    }
                }
            }

            // Sole mountain lake and river.
            else if (terrainType === "Sole Mountain")
            {
                if (worldFeatures.hasMountainLake)
                {
                    const mask = lakeMask(X, Z, worldFeatures.lakeX, worldFeatures.lakeZ, 10, 7);

                    if (mask > 0.88)
                    {
                        waterLevel = 8.35;
                        insideWater = true;
                    }
                }

                if (worldFeatures.hasRiver)
                {
                    const distance = riverDistance(X, Z, terrainSeed, worldFeatures.riverOffset);

                    if (distance < 1.5)
                    {
                        waterLevel = Math.max(waterLevel, 7.3);
                        insideWater = true;
                    }
                }
            }

            // Water is separate from the terrain.
            if (insideWater && waterLevel > heights[i] + 0.05)
            {
                waterMap[i] = 1;
                waterHeights[i] = waterLevel;
            }
        }
    }

    // --------------------------------------------------------
    // Glaciers and forest canopy.
    
    // Copy original heights for stable slope calculations.
    const baseHeights = new Float32Array(heights);

    const baseHeightAt = (x, z) => {
        x = Math.max(0, Math.min(N - 1, x));
        z = Math.max(0, Math.min(N - 1, z));
        return baseHeights[index(x, z)];
    };

    for (let z = 0; z < N; z++)
    {
        for (let x = 0; x < N; x++)
        {
            const i = index(x, z);
            const h = baseHeights[i];

            if (waterMap[i]) continue;

            const dx = (baseHeightAt(x + 1, z) - baseHeightAt(x - 1, z)) * 0.5;

            const dz = (baseHeightAt(x, z + 1) - baseHeightAt(x, z - 1)) * 0.5;

            const slope = Math.hypot(dx, dz);

            // Occasional ice patches at high elevations.
            if (terrainType === "Mountain Range" && worldFeatures.hasGlacier && h > 42 && slope < 2.5)
            {
                const iceNoise = fbm(x * 0.022, z * 0.022, terrainSeed + 1100);

                if (iceNoise > 0.59)
                {
                    glacierMap[i] = 1;
                    continue;
                }
            }

            // Slightly raise and darken forested columns.
            const canopy = forestCanopy(x - half, z - half, h, slope, terrainType, terrainSeed);

            heights[i] += canopy.rise;
            coverageMap[i] = canopy.coverage;
        }
    }

    // --------------------------------------------------------
    // Generate visible cube faces in chunks.
    for (let cz = 0; cz < N; cz += CHUNK_SIZE)
    {
        for (let cx = 0; cx < N; cx += CHUNK_SIZE)
        {
            const vertices = [];

            for (let z = cz; z < Math.min(cz + CHUNK_SIZE, N); z++)
            {
                for (let x = cx; x < Math.min(cx + CHUNK_SIZE, N); x++)
                {
                    const i = index(x, z);
                    const y = heightAt(x, z);

                    const X = x - half;
                    const Z = z - half;

                    const x0 = X - 0.5;
                    const x1 = X + 0.5;
                    const z0 = Z - 0.5;
                    const z1 = Z + 0.5;

                    // Ground color remains ground color, even underneath a water surface.
                    const topColor = elevationColor(y, terrainType, terrainSeed, x, z, coverageMap[i], false, glacierMap[i] === 1);

                    // Top terrain face.
                    addQuad(
                        vertices,
                        [
                            [x0, y, z0],
                            [x0, y, z1],
                            [x1, y, z1],
                            [x1, y, z0]
                        ],
                        [0, 1, 0],
                        [
                            topColor,
                            topColor,
                            topColor,
                            topColor
                        ]
                    );

                    // Draw water as a separate horizontal surface.
                    if (waterMap[i] === 1)
                    {
                        const waterY = waterHeights[i];
                        const waterColor = elevationColor(waterY, terrainType, terrainSeed, x, z, 0, true, false);

                        addQuad(
                            vertices,
                            [
                                [x0, waterY, z0],
                                [x0, waterY, z1],
                                [x1, waterY, z1],
                                [x1, waterY, z0]
                            ],
                            [0, 1, 0],
                            [
                                waterColor,
                                waterColor,
                                waterColor,
                                waterColor
                            ]
                        );
                    }

                    // Generate exposed side faces.
                    const sides = 
                    [
                        {h: heightAt(x, z + 1), n: [0, 0, 1], p: [[x0, z1], [x1, z1]]},
                        {h: heightAt(x, z - 1), n: [0, 0, -1], p: [[x1, z0], [x0, z0]]},
                        {h: heightAt(x + 1, z), n: [1, 0, 0], p: [[x1, z1], [x1, z0]]},
                        {h: heightAt(x - 1, z), n: [-1, 0, 0], p: [[x0, z0], [x0, z1]]}
                    ];

                    for (const side of sides)
                    {
                        if (side.h >= y - 0.001)
                        {
                            continue;
                        }

                        const low = side.h;
                        const bottomColor = elevationColor(Math.max(low, SEA_LEVEL + 0.1), terrainType, terrainSeed, x, z);
                        const [a, b] = side.p;

                        addQuad(
                            vertices,
                            [
                                [a[0], low, a[1]],
                                [b[0], low, b[1]],
                                [b[0], y, b[1]],
                                [a[0], y, a[1]]
                            ],
                            side.n,
                            [
                                bottomColor,
                                bottomColor,
                                topColor,
                                topColor
                            ]
                        );
                    }

                    // Occasional sandstone overhangs. (Gorge / Canyon only)
                    if (terrainType === "Gorge / Canyon")
                    {
                        const [worldX, worldZ] = terrainCoordinates(X, Z);
                        const center = riverCenter(worldZ, terrainSeed);
                        const distance = Math.abs(worldX - center);

                        if (
                            distance > 7 &&
                            distance < 19 &&
                            y > 17
                        )
                        {
                            const ledgeNoise = fbm(worldX * 0.12, worldZ * 0.12, terrainSeed + 1400);

                            // Sparse, deterministic placement.
                            const placement = hash2(x, z, terrainSeed + 1500);

                            if (ledgeNoise > 0.68 &&placement > 0.985)
                            {
                                const direction = worldX > center ? -1 : 1;
                                const projection = 2.0 + ledgeNoise * 2.5;

                                const ledgeY = y - 3.0;
                                const thickness = 1.2;

                                const ledgeCenterX = X + direction * projection * 0.5;
                                const rockColor = [0.48 + ledgeNoise * 0.08, 0.39 + ledgeNoise * 0.06, 0.30 + ledgeNoise * 0.04];

                                addRockBox(vertices, ledgeCenterX - projection * 0.5, ledgeY, Z - 0.5, ledgeCenterX + projection * 0.5, ledgeY + thickness, Z + 0.5, rockColor);
                            }
                        }
                    }
                }
            }

            // Upload chunk geometry to the GPU.
            if (vertices.length === 0)
            {
                continue;
            }

            const chunkBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, chunkBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

            terrainChunks.push({ buffer: chunkBuffer, count: vertices.length / 9 });
        }
    }

    // Reset the orbit camera.
    orbitRadius = N * 1.15;
    orbitPitch = 0.38;

    document.getElementById("page-description").textContent = terrainType + " · " + N + "×" + N + " cubes · R: regenerate · drag in manual mode";
}

// ------------------------------------------------------------------------------------------------------
// Section 9: Terrain Shaders

// Terrain uses per-vertex colors instead of one uniform color.
const terrainVertexSource = 
`
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec3 aColor;

uniform mat4 uView;
uniform mat4 uProjection;

varying vec3 vColor;
varying vec3 vNormal;

void main()
{
    vColor = aColor;
    vNormal = aNormal;

    gl_Position =
        uProjection *
        uView *
        vec4(aPosition, 1.0);
}
`;

const terrainFragmentSource = 
`
precision mediump float;

varying vec3 vColor;
varying vec3 vNormal;

void main()
{
    vec3 sun = normalize(vec3(0.5, 1.0, 0.3));

    float light =
        0.35 +
        0.65 *
        max(dot(normalize(vNormal), sun), 0.0);

    gl_FragColor = vec4(vColor * light, 1.0);
}
`;

const terrainProgram = createProgram(terrainVertexSource, terrainFragmentSource);

const terrainLocations = 
{
    position: gl.getAttribLocation(terrainProgram, "aPosition"),
    normal: gl.getAttribLocation(terrainProgram, "aNormal"),
    color: gl.getAttribLocation(terrainProgram, "aColor"),
    view: gl.getUniformLocation(terrainProgram, "uView"),
    projection: gl.getUniformLocation(
        terrainProgram, "uProjection"
    )
};

// ------------------------------------------------------------------------------------------------------
// Section 10: Render Terrain Chunks

// Renders the selected terrain chunk collection using the terrain shader.
// param:
// view = view matrix; projection = projection matrix; chunks = GPU mesh buffers
// returns:
// none; draws terrain
function renderTerrain(view, projection, chunks)
{
    gl.useProgram(terrainProgram);
    gl.uniformMatrix4fv(terrainLocations.view, false, view);
    gl.uniformMatrix4fv(terrainLocations.projection, false, projection);

    const terrainStride = 9 * 4;

    // Draw whichever chunk collection was supplied.
    for (const chunk of chunks)
    {
        gl.bindBuffer(gl.ARRAY_BUFFER, chunk.buffer);

        const attributes = 
        [
            [terrainLocations.position, 0],
            [terrainLocations.normal, 12],
            [terrainLocations.color, 24]
        ];

        for (const [location, offset] of attributes)
        {
            gl.enableVertexAttribArray(location);
            gl.vertexAttribPointer(location, 3, gl.FLOAT, false, terrainStride, offset);
        }

        gl.drawArrays(gl.TRIANGLES, 0, chunk.count);
    }

    gl.disableVertexAttribArray(terrainLocations.color);
}

// ------------------------------------------------------------------------------------------------------
// Section 11: Manual Camera Controls

canvas.addEventListener("pointerdown", event => {
    if ((currentPage !== "procedural" && currentPage !== "image") || !settings.manualCamera)
    {
        return;
    }

    dragging = true;

    lastMouseX = event.clientX;
    lastMouseY = event.clientY;

    canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", event => {
    if (!dragging) 
        return;

    orbitAngle += (event.clientX - lastMouseX) * 0.007;
    orbitPitch = clamp(orbitPitch + (event.clientY - lastMouseY) * 0.006, 0.12, 1.45);

    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
});

canvas.addEventListener("pointerup", () => { dragging = false; });

canvas.addEventListener("pointercancel", () => { dragging = false; });

canvas.addEventListener("wheel", event => {
    if ((currentPage !== "procedural" && currentPage !== "image") || !settings.manualCamera)
    {
        return;
    }

    event.preventDefault();

    orbitRadius = clamp(orbitRadius * Math.exp(event.deltaY * 0.001), GRID_SIZE * 0.35, GRID_SIZE * 3.5);
}, { passive: false });

// ------------------------------------------------------------------------------------------------------
// Section 12: Page Navigation

const pageInformation = 
{
    home: 
    [
        "Home Page",
        "Contains a rotating rainbow cube."
    ],
    procedural: 
    [
        "Procedural World",
        "Press R to generate a new landscape."
    ],
    image: 
    [
        "Image Data World",
        "Upload a color image and height map."
    ]
};

// Switches between home, procedural and image-based scenes.
// param:
// page = target page identifier
// returns:
// none; updates active page and UI
function switchPage(page)
{
    currentPage = page;

    if (page === "procedural" && terrainChunks.length === 0)
    {
        GenerateProceduralWorld();
    }

    document.getElementById("page-heading").textContent = pageInformation[page][0];

    document.getElementById("page-description").textContent = page === "procedural" ? terrainType + " · " + GRID_SIZE + "×" + GRID_SIZE +
     " cubes · R: regenerate" : pageInformation[page][1];

    document.querySelectorAll(".page-option").forEach(button => { button.classList.toggle("active", button.dataset.page === page); });

    document.getElementById("upload-screen").style.display = page === "image" && !imageWorldReady ? "flex" : "none";

    closeMenus();
}

// Closes open navigation menus.
// param:
// none
// returns:
// none
function closeMenus()
{
    document.querySelectorAll(".menu").forEach(menu => { menu.classList.remove("open"); 
        menu.querySelector(".menu-button").setAttribute("aria-expanded", "false"); });
}

document.querySelectorAll(".menu-button").forEach(button => { button.addEventListener("click", event => { event.stopPropagation(); const menu = button.parentElement; 
    const wasOpen = menu.classList.contains("open"); closeMenus(); menu.classList.toggle("open", !wasOpen); button.setAttribute("aria-expanded", String(!wasOpen)); }); });

document.addEventListener("click", event => {
    if (!event.target.closest(".menu"))
    {
        closeMenus();
    }
});

document.querySelectorAll(".page-option").forEach(button => { button.addEventListener("click", () => { switchPage(button.dataset.page); }); });

// ------------------------------------------------------------------------------------------------------
// Section 13: Settings Toggles

document.querySelectorAll("[data-setting]").forEach(input => { input.addEventListener("change", () => { settings[input.dataset.setting] = input.checked; 
    if (input.dataset.setting === "manualCamera")
        {
            dragging = false;
        }
    });
});

// ------------------------------------------------------------------------------------------------------
// Section 14: Keyboard Controls

document.addEventListener("keydown", event => {
    if (event.key === "Escape")
    {
        closeMenus();
    }

    const key = event.key.toLowerCase();

    if (key !== "r") 
        return;

    const activeTag = document.activeElement.tagName;

    if (activeTag === "INPUT" || activeTag === "TEXTAREA")
    {
        return;
    }

    if (currentPage === "procedural")
    {
        GenerateProceduralWorld();
    }
    else if (currentPage === "image")
    {
        resetImageWorld();
    }
});

// ------------------------------------------------------------------------------------------------------
// Section 15: Image Data World: Pixel Sampling And Cube Geometry

const colorFile = document.getElementById("color-file");
const heightFile = document.getElementById("height-file");
const imageResolution = document.getElementById("image-resolution");
const generateButton = document.getElementById("generate-image");
const uploadMessage = document.getElementById("upload-message");
const uploadScreen = document.getElementById("upload-screen");

// ------------------------------------------------------------
// Section 15.1: Upload Controls

// Only enable generation after both images are selected.
// Enables image generation only after both files are selected.
// param:
// none
// returns:
// none; updates button state
function updateUploadState()
{
    generateButton.disabled = !(colorFile.files.length && heightFile.files.length);
}

colorFile.addEventListener("change", updateUploadState);
heightFile.addEventListener("change", updateUploadState);

// Delete previous GPU buffers when resetting the world.
// Deletes existing image-world GPU buffers.
// param:
// none
// returns:
// none
function clearImageChunks()
{
    for (const chunk of imageChunks)
    {
        gl.deleteBuffer(chunk.buffer);
    }

    imageChunks = [];
}

// Return to the image upload screen.
// Resets the image terrain and returns to the upload form.
// param:
// none
// returns:
// none
function resetImageWorld()
{
    clearImageChunks();

    imageWorldReady = false;

    colorFile.value = "";
    heightFile.value = "";

    updateUploadState();

    uploadMessage.textContent = "Both PNG files are required.";

    if (currentPage === "image")
    {
        uploadScreen.style.display = "flex";

        document.getElementById("page-description").textContent = "Upload a color image and a grayscale height map.";
    }
}

// ------------------------------------------------------------
// Section 15.2: Load An Image

// Read a local image using the browser's Image object.
// Loads a selected image file through a temporary object URL.
// param:
// file = local image File
// returns:
// a Promise resolving to an Image
async function loadLocalImage(file)
{
    const url = URL.createObjectURL(file);

    try
    {
        const img = new Image();

        await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error("Could not read " + file.name)); img.src = url; });

        return img;
    }
    finally
    {
        URL.revokeObjectURL(url);
    }
}

// ------------------------------------------------------------
// Section 15.3: Sample Image Pixels

// Resize the source image to the chosen grid resolution.
// getImageData() returns RGBA values from 0 to 255.
// Resamples an image on a canvas and reads its pixel data.
// param:
// image = source Image; size = target grid width and height
// returns:
// RGBA pixel array
function sampleImage(image, size)
{
    const offscreen = document.createElement("canvas");

    offscreen.width = size;
    offscreen.height = size;

    const ctx = offscreen.getContext("2d", { willReadFrequently: true });

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Resample the source image to match the cube grid.
    ctx.drawImage(image, 0, 0, size, size);

    return ctx.getImageData(0, 0, size, size).data;
}

// ------------------------------------------------------------
// Section 15.4: Generate The Image Landscape

// Converts color and heightmap pixels into cube terrain chunks.
// param:
// colorPixels = RGBA colors; heightPixels = RGBA elevations; N = grid resolution
// returns:
// none; updates imageChunks and scene state
function buildImageWorld(colorPixels, heightPixels, N)
{

    // Remove any previously generated image world.
    clearImageChunks();

    const count = N * N;

    const heights = new Float32Array(count);
    const colors = new Float32Array(count * 3);

    // Height map intensity range: 0 to 255.
    // Actual world elevation range: 2 to 65.
    const minimumHeight = 2;
    const maximumHeight = 65;

    const index = (x, z) => z * N + x;

    // --------------------------------------------------------
    // Convert image pixels to heights and colors.

    for (let z = 0; z < N; z++)
    {
        for (let x = 0; x < N; x++)
        {
            const i = index(x, z);

            // Each image pixel contains 4 values: RGBA.
            const p = i * 4;

            // Calculate grayscale intensity using luminance.
            const gray = 0.2126 * heightPixels[p] + 0.7152 * heightPixels[p + 1] + 0.0722 * heightPixels[p + 2];

            // Convert 0-255 intensity to world height.
            heights[i] = minimumHeight + (gray / 255) * (maximumHeight - minimumHeight);

            // Convert RGB from 0-255 to WebGL's 0-1 range.
            for (let c = 0; c < 3; c++)
            {
                colors[i * 3 + c] = colorPixels[p + c] / 255;
            }
        }
    }

    // Get the height of a neighboring cube column.
    const getHeight = (x, z) => {
        if (x < 0 || z < 0 || x >= N || z >= N)
        {
            return 0;
        }

        return heights[index(x, z)];
    };

    // Get the RGB color of a cube column.
    const getColor = (i) => [
        colors[i * 3],
        colors[i * 3 + 1],
        colors[i * 3 + 2]
    ];

    const half = N / 2;

    // --------------------------------------------------------
    // Build cube geometry in chunks.

    for (let cz = 0; cz < N; cz += CHUNK_SIZE)
    {
        for (let cx = 0; cx < N; cx += CHUNK_SIZE)
        {
            const vertices = [];

            for (let z = cz; z < Math.min(cz + CHUNK_SIZE, N); z++)
            {
                for (let x = cx; x < Math.min(cx + CHUNK_SIZE, N); x++)
                {
                    const i = index(x, z);
                    const y = heights[i];
                    const color = getColor(i);

                    // Center the landscape around the origin.
                    const X = x - half;
                    const Z = z - half;

                    // Cube column boundaries.
                    const x0 = X - 0.5;
                    const x1 = X + 0.5;

                    const z0 = Z - 0.5;
                    const z1 = Z + 0.5;

                    // All four corners share the sampled color.
                    const same = [color, color, color, color];

                    // Top face
                    addQuad
                    (
                        vertices,
                        [
                            [x0, y, z0],
                            [x0, y, z1],
                            [x1, y, z1],
                            [x1, y, z0]
                        ],
                        [0, 1, 0],
                        same
                    );

                    // Side faces
                    // Only draw the parts exposed above neighbors.
                    const sides = 
                    [
                        {h: getHeight(x, z + 1), n: [0, 0, 1], p: [[x0, z1], [x1, z1]]},
                        {h: getHeight(x, z - 1), n: [0, 0, -1], p: [[x1, z0], [x0, z0]]},
                        {h: getHeight(x + 1, z), n: [1, 0, 0], p: [[x1, z1], [x1, z0]]},
                        {h: getHeight(x - 1, z), n: [-1, 0, 0], p: [[x0, z0], [x0, z1]]}
                    ];

                    for (const side of sides)
                    {
                        // Skip completely hidden side faces.
                        if (side.h >= y - 0.001)
                        {
                            continue;
                        }

                        const [a, b] = side.p;

                        addQuad
                        (
                            vertices,
                            [
                                [a[0], side.h, a[1]],
                                [b[0], side.h, b[1]],
                                [b[0], y, b[1]],
                                [a[0], y, a[1]]
                            ],
                            side.n,
                            same
                        );
                    }
                }
            }

            // --------------------------------------------------------
            // Upload chunk geometry to the GPU.

            const chunkBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, chunkBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

            imageChunks.push({ buffer: chunkBuffer, count: vertices.length / 9 });
        }
    }

    // --------------------------------------------------------
    // Camera and Page Information

    orbitRadius = N * 1.15;
    orbitPitch = 0.38;

    imageWorldReady = true;

    // Hide the upload screen after generation.
    uploadScreen.style.display = "none";

    document.getElementById("page-description").textContent = "Image landscape · " + N + "×" + N + " · R: reset";
}

// ------------------------------------------------------------
// Section 15.5: Generate Button

generateButton.addEventListener("click", async () => {
    if (!colorFile.files.length || !heightFile.files.length)
    {
        return;
    }

    generateButton.disabled = true;
    uploadMessage.textContent = "Reading images and generating cubes...";

    try
    {
        // Decode both images.
        const [colorImage, heightImage] = await Promise.all([ loadLocalImage(colorFile.files[0]), loadLocalImage(heightFile.files[0]) ]);

        // Read the selected resolution.
        const N = Number(imageResolution.value);

        // Sample both images at the same resolution.
        const colorPixels = sampleImage(colorImage, N);
        const heightPixels = sampleImage(heightImage, N);

        // Construct the landscape.
        buildImageWorld(colorPixels, heightPixels, N);
    }
    catch (error)
    {
        uploadMessage.textContent = "Error: " + error.message;
    }
    finally
    {
        updateUploadState();
    }
});

// ------------------------------------------------------------------------------------------------------
// Section 16: Matrix Functions

// Builds a 4x4 translation matrix.
// param:
// x, y, z = translation components
// returns:
// a translation matrix
function translation(x, y, z)
{
    return [
        1,0,0,0,
        0,1,0,0,
        0,0,1,0,
        x,y,z,1
    ];
}

// Builds a 4x4 scale matrix.
// param:
// x, y, z = axis scale factors
// returns:
// a scale matrix
function scaling(x, y, z)
{
    return [
        x,0,0,0,
        0,y,0,0,
        0,0,z,0,
        0,0,0,1
    ];
}

// Multiplies two 4x4 matrices.
// param:
// a, b = matrices
// returns:
// their matrix product
function multiply(a, b)
{
    const result = new Array(16).fill(0);

    for (let col = 0; col < 4; col++)
    {
        for (let row = 0; row < 4; row++)
        {
            for (let k = 0; k < 4; k++)
            {
                result[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k];
            }
        }
    }

    return result;
}

// Creates a perspective projection for the pinhole camera.
// param:
// fov = field of view; aspect = viewport ratio; near, far = clipping planes
// returns:
// a projection matrix
function perspective(fov, aspect, near, far)
{
    const f = 1 / Math.tan(fov / 2);

    return [
        f/aspect,0,0,0,
        0,f,0,0,
        0,0,(far+near)/(near-far),-1,
        0,0,(2*far*near)/(near-far),0
    ];
}

// Builds the camera view matrix.
// param:
// eye = camera position; target = look-at point; up = up direction
// returns:
// a view matrix
function lookAt(eye, target, up)
{
    const subtract = (a, b) => [
        a[0]-b[0],
        a[1]-b[1],
        a[2]-b[2]
    ];

    const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];

    const cross = (a, b) => [
        a[1]*b[2]-a[2]*b[1],
        a[2]*b[0]-a[0]*b[2],
        a[0]*b[1]-a[1]*b[0]
    ];

    const normalize = a => {
        const length = Math.hypot(...a);

        return a.map(v => v / length);
    };

    const zAxis = normalize(subtract(eye, target));
    const xAxis = normalize(cross(up, zAxis));
    const yAxis = cross(zAxis, xAxis);

    return [
        xAxis[0],yAxis[0],zAxis[0],0,
        xAxis[1],yAxis[1],zAxis[1],0,
        xAxis[2],yAxis[2],zAxis[2],0,
        -dot(xAxis,eye), -dot(yAxis,eye),
        -dot(zAxis,eye),
        1
    ];
}

// ------------------------------------------------------------------------------------------------------
// Section 17: Rotation Matrices

// Builds a rotation matrix around the X axis.
// param:
// angle = radians
// returns:
// a rotation matrix
function rotationX(angle)
{
    const c = Math.cos(angle);
    const s = Math.sin(angle);

    return [
        1,0,0,0,
        0,c,s,0,
        0,-s,c,0,
        0,0,0,1
    ];
}

// Builds a rotation matrix around the Y axis.
// param:
// angle = radians
// returns:
// a rotation matrix
function rotationY(angle)
{
    const c = Math.cos(angle);
    const s = Math.sin(angle);

    return [
        c,0,-s,0,
        0,1,0,0,
        s,0,c,0,
        0,0,0,1
    ];
}

// Builds a rotation matrix around the Z axis.
// param:
// angle = radians
// returns:
// a rotation matrix
function rotationZ(angle)
{
    const c = Math.cos(angle);
    const s = Math.sin(angle);

    return [
        c,s,0,0,
        -s,c,0,0,
        0,0,1,0,
        0,0,0,1
    ];
}

// ------------------------------------------------------------------------------------------------------
// Section 18: Home Page Cube

// Computes the changing color of the home-page cube.
// param:
// time = animation time in seconds
// returns:
// an RGB color
function rainbowColor(time)
{
    const hue = (time * 0.055) % 1;

    const f = n => {
        const k = (n + hue * 6) % 6;

        return 1 - Math.max(0, Math.min(k, 4-k, 1));
    };

    return [f(5), f(3), f(1)];
}

// Draws a cube using the home-page shader and model transform.
// param:
// model = model matrix; color = RGB color
// returns:
// none; issues a draw call
function drawCube(model, color)
{
    gl.uniformMatrix4fv(uModel, false, model);
    gl.uniform3fv(uColor, color);
    gl.drawArrays(gl.TRIANGLES, 0, VERTEX_COUNT);
}

// ------------------------------------------------------------------------------------------------------
// Section 18.1: Skybox

const skyProgram = createProgram
(`
attribute vec3 aPosition;
uniform mat4 uViewRotation;
uniform mat4 uProjection;
varying vec3 vDirection;
void main()
{
    vec3 position = aPosition - vec3(0.0, 0.5, 0.0);
    vDirection = position;
    vec4 clip = uProjection * uViewRotation * vec4(position, 1.0);
    gl_Position = clip.xyww;
}
`, `
precision mediump float;
uniform samplerCube uSky;
varying vec3 vDirection;
void main()
{
    gl_FragColor = textureCube(uSky, normalize(vDirection));
}
`);
const skyPosition = gl.getAttribLocation(skyProgram, "aPosition");
const skyViewRotation = gl.getUniformLocation(skyProgram, "uViewRotation");
const skyProjection = gl.getUniformLocation(skyProgram, "uProjection");
const skySampler = gl.getUniformLocation(skyProgram, "uSky");
const skyTexture = gl.createTexture();
let skyReady = false;

// Cross layout: top at (1,0), left/front/right/back in row 1, bottom at (1,2). Each face is 512 x 512 pixels.
const skyFaces = 
[
    [gl.TEXTURE_CUBE_MAP_POSITIVE_X, 2, 1],
    [gl.TEXTURE_CUBE_MAP_NEGATIVE_X, 0, 1],
    [gl.TEXTURE_CUBE_MAP_POSITIVE_Y, 1, 0],
    [gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, 1, 2],
    [gl.TEXTURE_CUBE_MAP_POSITIVE_Z, 1, 1],
    [gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, 3, 1]
];

const skyImage = new Image();
skyImage.onload = () => {
    const faceSize = Math.floor(skyImage.width / 4);

    if (skyImage.height !== faceSize * 3)
    {
        console.error("Skybox image must be a 4x3 cubemap cross.");
        return;
    }

    gl.bindTexture(gl.TEXTURE_CUBE_MAP, skyTexture);

    for (const [face, col, row] of skyFaces)
    {
        const faceCanvas = document.createElement("canvas");
        faceCanvas.width = faceSize;
        faceCanvas.height = faceSize;
        const context = faceCanvas.getContext("2d");
        context.drawImage(skyImage, col * faceSize, row * faceSize, faceSize, faceSize, 0, 0, faceSize, faceSize);
        gl.texImage2D(face, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, faceCanvas);
    }

    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    skyReady = true;
};

skyImage.onerror = () => console.error("Could not load skybox PNG.");
skyImage.src = "Cubemap_Sky_04-512x512.png";

// Draws the cubemap around the camera when enabled.
// param:
// view = camera view matrix; projection = projection matrix
// returns:
// none; renders the skybox
function renderSkybox(view, projection)
{
    if (!settings.skybox || !skyReady) 
        return;

    // The sky rotates with the camera, but never translates.
    const rotationOnly = view.slice();
    rotationOnly[12] = 0;
    rotationOnly[13] = 0;
    rotationOnly[14] = 0;

    gl.depthMask(false);
    gl.depthFunc(gl.LEQUAL);
    gl.useProgram(skyProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(skyPosition);
    gl.vertexAttribPointer(skyPosition, 3, gl.FLOAT, false, 24, 0);
    gl.uniformMatrix4fv(skyViewRotation, false, rotationOnly);
    gl.uniformMatrix4fv(skyProjection, false, projection);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, skyTexture);
    gl.uniform1i(skySampler, 0);
    gl.drawArrays(gl.TRIANGLES, 0, VERTEX_COUNT);
    gl.depthMask(true);
    gl.depthFunc(gl.LESS);
}

// ------------------------------------------------------------------------------------------------------
// Section 18.2: Skyscape Cube Clouds

// Cubic Bezier curve: P0 and P3 are endpoints; P1 and P2
// determine the curvature of the cloud's flight path.
// Evaluates a cubic Bézier curve for cloud animation.
// param:
// p0, p1, p2, p3 = 3D control points; t = normalized path position
// returns:
// a 3D point on the curve
function skyBezier(p0, p1, p2, p3, t)
{
    const q = 1 - t;

    return [0, 1, 2].map(i => q*q*q*p0[i] + 3*q*q*t*p1[i] + 3*q*t*t*p2[i] + t*t*t*p3[i]);
}

// Draws one transformed cube used to build clouds.
// param:
// position = center; size = dimensions; color = RGB; angle = rotation
// returns:
// none; draws a cube
function skyCube(position, size, color, angle = 0)
{
    // Scale a unit cube, rotate, and translate into place.
    const model = multiply(translation(...position), multiply(rotationY(angle), scaling(...size)));
    drawCube(model, color);
}

// Constructs a cloud from several transformed cubes.
// param:
// center = cloud location; size = scale; shade = color intensity
// returns:
// none; draws cloud cubes
function drawSkyCloud(center, size, shade)
{
    const [x, y, z] = center;
    const white = [shade, shade, Math.min(1, shade + 0.025)];
    const parts = 
    [
        [-5,0,0, 8,3.2,5], [1,0,0, 10,4.5,6],
        [6,0,1, 7,3,5], [-1,2,0, 6,3.5,5],
        [3,3,-1, 5,3,4], [-6,1,-1, 5,3,4]
    ];
    for (const [dx,dy,dz,sx,sy,sz] of parts)
    {
        skyCube([x+dx*size, y+dy*size, z+dz*size], [sx*size,sy*size,sz*size], white);
    }
}

// Animates clouds along cubic Bezier paths and renders them.
// param:
// view = view matrix; projection = projection matrix; time = animation time
// returns:
// none; renders clouds
function renderSkyscape(view, projection, time)
{
    if (!settings.skyscape) 
        return;

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(aPosition);
    gl.enableVertexAttribArray(aNormal);
    gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 24, 0);
    gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 24, 12);
    gl.uniformMatrix4fv(uView, false, view);
    gl.uniformMatrix4fv(uProjection, false, projection);

    // Each cloud follows a looping cubic Bezier route. The
    // modulo operation resets t to 0 when it reaches 1.
    // Paths begin/end beyond the landscape to hide the reset.
    const clouds = 
    [
        [[-260,105,-85],[-90,111,-110],[90,103,-70],[260,108,-45],1.7,0.87,0.006,0],
        [[260,115,20],[85,121,45],[-85,112,0],[-260,117,-30],1.2,0.94,0.004,0.35],
        [[-260,112,100],[-70,117,75],[80,109,130],[260,113,110],1.5,0.90,0.005,0.65],
        [[260,95,-130],[90,101,-95],[-90,93,-120],[-260,97,-80],1.9,0.87,0.0035,0.2],
        [[-260,102,170],[-80,107,130],[75,100,150],[260,104,175],1.4,0.94,0.0045,0.8],
        [[260,120,-175],[75,125,-140],[-85,116,-165],[-260,122,-150],1.2,0.90,0.0055,0.5]
    ];

    for (const [p0,p1,p2,p3,size,shade,speed,offset] of clouds)
    {
        const t = (time * speed + offset) % 1;
        const center = skyBezier(p0,p1,p2,p3,t);
        drawSkyCloud(center, size, shade);
    }
}

// ------------------------------------------------------------------------------------------------------
// Section 19: Main Render Loop

// Main animation loop. updates camera and draws the active scene.
// param:
// timeMilliseconds = requestAnimationFrame timestamp
// returns:
// none; schedules the next frame
function draw(timeMilliseconds)
{
    const width = Math.max(1, Math.round(canvas.clientWidth * window.devicePixelRatio));
    const height = Math.max(1, Math.round(canvas.clientHeight * window.devicePixelRatio));

    if (canvas.width !== width || canvas.height !== height)
    {
        canvas.width = width;
        canvas.height = height;
    }

    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 1);
    gl.enable(gl.DEPTH_TEST);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const t = timeMilliseconds * 0.001;
    const dt = Math.min(0.05, (timeMilliseconds - (lastFrameTime || timeMilliseconds)) * 0.001);

    lastFrameTime = timeMilliseconds;

    const projection = perspective(Math.PI / 4, width / height, 0.1, 2500);

    // Home Page
    if (currentPage === "home")
    {
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

        gl.enableVertexAttribArray(aPosition);
        gl.enableVertexAttribArray(aNormal);

        gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 24, 0);

        gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 24, 12);

        gl.uniformMatrix4fv(uProjection, false, projection);

        gl.uniformMatrix4fv(uView, false,
            lookAt
            (
                [0, 1.8, 8],
                [0, 0, 0],
                [0, 1, 0]
            )
        );

        const rotation = multiply(rotationY(t * 0.52), multiply(rotationX(t * 0.37), rotationZ(t * 0.21)));
        const model = multiply(rotation, multiply(translation(0, -1.15, 0), scaling(2.3, 2.3, 2.3)));

        drawCube(model, rainbowColor(t));
    }

    // Procedural World
    else if (currentPage === "procedural" || (currentPage === "image" && imageWorldReady))
    {
        // Rotate automatically unless manual mode is enabled.
        if (!settings.manualCamera)
        {
            orbitAngle += dt * 0.15;
        }

        const horizontal = orbitRadius * Math.cos(orbitPitch);
        const eye = [Math.sin(orbitAngle) * horizontal, Math.sin(orbitPitch) * orbitRadius, Math.cos(orbitAngle) * horizontal];
        const view = lookAt(eye, [0, 8, 0], [0, 1, 0]);

        renderSkybox(view, projection);
        renderTerrain(view, projection, currentPage === "image" ? imageChunks : terrainChunks);
        renderSkyscape(view, projection, t);
    }

    requestAnimationFrame(draw);
}

// Start the application.
requestAnimationFrame(draw);