document.addEventListener("DOMContentLoaded", () => {
    const urlParams = new URLSearchParams(window.location.search);
    const dataParam = urlParams.get("p");

    if (!dataParam) {
        alert("No puzzle data found. Returning to creator hub...");
        window.location.href = "index.html";
        return;
    }

    try {
        const decodedData = JSON.parse(decodeURIComponent(escape(atob(dataParam))));
        document.getElementById("secret-message-display").innerText = decodedData.msg;

        const imageObj = new Image();
        imageObj.src = decodedData.img;
        imageObj.onload = function() {
            initializePuzzleCanvas(imageObj, decodedData.count || 12);
        };
    } catch (err) {
        alert("Invalid or corrupt challenge link payload structure.");
    }

    function calculateGrid(totalPieces) {
        if (totalPieces <= 12) return { cols: 4, rows: 3 };
        if (totalPieces <= 24) return { cols: 6, rows: 4 };
        if (totalPieces <= 36) return { cols: 6, rows: 6 };
        return { cols: 10, rows: 5 }; 
    }

    function initializePuzzleCanvas(puzzleImage, pieceCount) {
        const cw = 600; const ch = 450;
        
        const stage = new Konva.Stage({ container: 'canvas-container', width: cw, height: ch });
        const pieceLayer = new Konva.Layer();
        stage.add(pieceLayer);

        const grid = calculateGrid(pieceCount);
        const pw = cw / grid.cols; const ph = ch / grid.rows;

        // 1. GRID STRUCTURE & RANDOMIZED ORIENTATION MATRIX
        // Assigns 1 (outie) or -1 (innie) to internal grid lines, leaving outer lines 0 (flat)
        const verticalEdges = []; // dimension: [rows][cols + 1]
        for (let r = 0; r < grid.rows; r++) {
            verticalEdges[r] = [];
            for (let c = 0; c <= grid.cols; c++) {
                if (c === 0 || c === grid.cols) {
                    verticalEdges[r][c] = 0; // Flat outer boundaries
                } else {
                    verticalEdges[r][c] = Math.random() > 0.5 ? 1 : -1; // Randomized innie/outie
                }
            }
        }

        const horizontalEdges = []; // dimension: [rows + 1][cols]
        for (let r = 0; r <= grid.rows; r++) {
            horizontalEdges[r] = [];
            for (let c = 0; c < grid.cols; c++) {
                if (r === 0 || r === grid.rows) {
                    horizontalEdges[r][c] = 0; // Flat outer boundaries
                } else {
                    horizontalEdges[r][c] = Math.random() > 0.5 ? 1 : -1; // Randomized innie/outie
                }
            }
        }

        for (let r = 0; r < grid.rows; r++) {
            for (let c = 0; c < grid.cols; c++) {
                
                // Track orientation definitions surrounding this specific grid cell
                const topType = horizontalEdges[r][c];
                const rightType = verticalEdges[r][c + 1];
                const bottomType = horizontalEdges[r + 1][c];
                const leftType = verticalEdges[r][c];

                const piece = new Konva.Shape({
                    x: Math.random() * (cw - pw),
                    y: Math.random() * (ch - ph),
                    width: pw,
                    height: ph,
                    draggable: true,
                    stroke: '#334155',
                    strokeWidth: 1.5,
                    dragBoundFunc: function(pos) {
                        return {
                            x: Math.max(0, Math.min(cw - pw, pos.x)),
                            y: Math.max(0, Math.min(ch - ph, pos.y))
                        };
                    },
                    sceneFunc: function(context, shape) {
                        context.beginPath();
                        // Start at top-left corner of the piece local space (0,0)
                        context.moveTo(0, 0);

                        // 2 & 3. FLAT EDGES & BEZIER CURVE TABS DRAWING SEQUENCE
                        // Top Edge (Left to Right)
                        if (topType === 0) context.lineTo(pw, 0);
                        else drawBezierTab(context, 0, 0, pw, 0, topType);

                        // Right Edge (Top to Bottom)
                        if (rightType === 0) context.lineTo(pw, ph);
                        else drawBezierTab(context, pw, 0, pw, ph, rightType);

                        // Bottom Edge (Right to Left)
                        if (bottomType === 0) context.lineTo(0, ph);
                        else drawBezierTab(context, pw, ph, 0, ph, bottomType);

                        // Left Edge (Bottom to Top)
                        if (leftType === 0) context.lineTo(0, 0);
                        else drawBezierTab(context, 0, ph, 0, 0, leftType);

                        context.closePath();
                        context.fillStrokeShape(shape);
                    }
                });

                // Clip and map texture layout coordinates seamlessly
                piece.fillPatternImage(puzzleImage);
                piece.fillPatternScale({ x: cw / puzzleImage.width, y: ch / puzzleImage.height });
                piece.fillPatternOffset({ x: c * (puzzleImage.width / grid.cols), y: r * (puzzleImage.height / grid.rows) });

                const tx = c * pw; const ty = r * ph;

                piece.on('dragend', () => {
                    if (Math.abs(piece.x() - tx) < 22 && Math.abs(piece.y() - ty) < 22) {
                        piece.position({ x: tx, y: ty });
                        piece.draggable(false);
                        piece.strokeWidth(0.5); // Clean merge line thickness
                        
                        piece.moveToBottom();
                        pieceLayer.draw();
                        
                        checkGameCompletion(pieceLayer);
                    }
                });
                pieceLayer.add(piece);
            }
        }
        pieceLayer.draw();
    }

    // 3. BEZIER CURVE TABS LOGIC ENGINE
    // Renders a smooth classic jigsaw puzzle tab connecting two corner nodes via Cubic Beziers
    function drawBezierTab(ctx, x1, y1, x2, y2, direction) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const l = Math.sqrt(dx * dx + dy * dy);
        
        // Calculate normal vector projection factors (defines outie/innie alignment)
        const nx = -dy / l;
        const ny = dx / l;
        
        // Scale parameters for standard interlocking proportions
        const tabScale = l * 0.15 * direction;

        // Establish anchor control path landmarks along the edge axis
        const p1x = x1 + dx * 0.35; const p1y = y1 + dy * 0.35;
        const p2x = x1 + dx * 0.45; const p2y = y1 + dy * 0.45;
        const p3x = x1 + dx * 0.55; const p3y = y1 + dy * 0.55;
        const p4x = x1 + dx * 0.65; const p4y = y1 + dy * 0.65;

        // Curve Segment 1: Base to Neck transition
        ctx.bezierCurveTo(
            p1x, p1y,
            p1x + nx * tabScale * 0.2, p1y + ny * tabScale * 0.2,
            p2x + nx * tabScale * 0.6, p2y + ny * tabScale * 0.6
        );

        // Curve Segment 2: Head of the bulbous tab
        ctx.bezierCurveTo(
            p2x + nx * tabScale * 1.3, p2y + ny * tabScale * 1.3,
            p3x + nx * tabScale * 1.3, p3y + ny * tabScale * 1.3,
            p3x + nx * tabScale * 0.6, p3y + ny * tabScale * 0.6
        );

        // Curve Segment 3: Return down neck to opposite base anchor
        ctx.bezierCurveTo(
            p3x + nx * tabScale * 0.2, p3y + ny * tabScale * 0.2,
            p4x, p4y,
            x2, y2
        );
    }

    function checkGameCompletion(pieceLayer) {
        const active = pieceLayer.getChildren(node => node.draggable() === true);
        
        if (active.length === 0) {
            setTimeout(() => {
                const canvasContainer = document.getElementById("canvas-container");
                const messageDisplay = document.getElementById("secret-message-display");
                
                canvasContainer.classList.add("fade-out-canvas");
                messageDisplay.classList.add("reveal-text");

                setTimeout(() => {
                    alert("🎉 Surprise Uncovered! You solved the puzzle completely!");
                }, 1500);
            }, 300);
        }
    }
});