import { MeasuredTemplatePF } from "../measure.js";

/**
 * A helper class for building MeasuredTemplates for PF1 spells and abilities
 *
 * @augments {MeasuredTemplate}
 */
export class AbilityTemplate extends MeasuredTemplatePF {
  /**
   * A factory method to create an AbilityTemplate instance using provided data
   *
   * @param {string} type -             The type of template ("cone", "circle", "rect" or "ray")
   * @param {number} distance -         The distance/size of the template
   * @param options
   * @returns {AbilityTemplate|null}     The template object, or null if the data does not produce a template
   */
  static fromData(options) {
    const type = options.type;
    const distance = options.distance;
    if (!type) return null;
    if (!distance) return null;
    if (!canvas.scene) return null;
    if (!["cone", "circle", "rect", "ray"].includes(type)) return null;

    // Prepare template data
    const templateData = {
      t: type,
      user: game.user.id,
      distance: distance || 5,
      direction: 0,
      x: 0,
      y: 0,
      fillColor: options.color ? options.color : game.user.color,
      texture: options.texture ? options.texture : null,
      _id: randomID(16),
    };

    // Additional type-specific data
    switch (type) {
      case "cone":
        if (game.settings.get("pf1", "measureStyle") === true) templateData.angle = 90;
        else templateData.angle = 53.13;
        break;
      case "rect":
        templateData.distance = Math.sqrt(Math.pow(distance, 2) + Math.pow(distance, 2));
        templateData.direction = 45;
        break;
      case "ray":
        templateData.width = 5;
        break;
      default:
        break;
    }

    // Return the template constructed from the item data
    const cls = CONFIG.MeasuredTemplate.documentClass;
    const template = new cls(templateData, { parent: canvas.scene });
    const object = new this(template);
    return object;
  }

  /* -------------------------------------------- */

  /**
   * Creates a preview of the spell template
   *
   * @param {Event} event   The initiating click event
   */
  async drawPreview(event) {
    const initialLayer = canvas.activeLayer;
    await this.draw();
    this.active = true;
    this.layer.activate();
    this.layer.preview.addChild(this);
    return this.activatePreviewListeners(initialLayer);
  }

  /* -------------------------------------------- */

  /**
   * Activate listeners for the template preview
   *
   * @param {CanvasLayer} initialLayer  The initially active CanvasLayer to re-activate after the workflow is complete
   * @returns {Promise<boolean>} Returns true if placed, or false if cancelled
   */
  activatePreviewListeners(initialLayer) {
    return new Promise((resolve) => {
      const handlers = {};
      let moveTime = 0;

      const pfStyle = game.settings.get("pf1", "measureStyle") === true;

      const _clear = () => {
        if (this.destroyed) return;
        this.destroy();
      };

      // Update placement (mouse-move)
      handlers.mm = (event) => {
        event.stopPropagation();
        const now = Date.now(); // Apply a 20ms throttle
        if (now - moveTime <= 20) return;
        const center = event.data.getLocalPosition(this.layer);
        const pos = canvas.grid.getSnappedPosition(center.x, center.y, 2);
        this.data.x = pos.x;
        this.data.y = pos.y;
        this.refresh();
        canvas.app.render();
        moveTime = now;
      };

      // Cancel the workflow (right-click)
      handlers.rc = (event, canResolve = true) => {
        this.layer.preview.removeChildren();
        canvas.stage.off("mousemove", handlers.mm);
        canvas.stage.off("mousedown", handlers.lc);
        canvas.app.view.oncontextmenu = null;
        canvas.app.view.onwheel = null;
        // Clear highlight
        this.active = false;
        const hl = canvas.grid.getHighlightLayer(`Template.${this.id}`);
        hl.clear();
        _clear();

        initialLayer.activate();
        if (canResolve)
          resolve({
            result: false,
          });
      };

      // Confirm the workflow (left-click)
      handlers.lc = async (event) => {
        handlers.rc(event, false);

        // Confirm final snapped position
        this.data.update(this.data);

        // Create the template
        const result = {
          result: true,
          place: async () => {
            const doc = (await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [this.data.toObject()]))[0];
            this.document = doc;
            return doc;
          },
          delete: () => {
            return this.document.delete();
          },
        };
        _clear();
        resolve(result);
      };

      // Rotate the template by 3 degree increments (mouse-wheel)
      handlers.mw = (event) => {
        if (event.ctrlKey) event.preventDefault(); // Avoid zooming the browser window
        event.stopPropagation();
        let delta, snap;
        if (event.ctrlKey) {
          if (this.data.t === "rect") {
            delta = Math.sqrt(canvas.dimensions.distance * canvas.dimensions.distance);
          } else {
            delta = canvas.dimensions.distance;
          }
          this.data.distance += delta * -Math.sign(event.deltaY);
        } else {
          if (pfStyle && this.data.t === "cone") {
            delta = 90;
            snap = event.shiftKey ? delta : 45;
          } else {
            delta = canvas.grid.type > CONST.GRID_TYPES.SQUARE ? 30 : 15;
            snap = event.shiftKey ? delta : 5;
          }
          if (this.data.t === "rect") {
            snap = Math.sqrt(Math.pow(5, 2) + Math.pow(5, 2));
            this.data.distance += snap * -Math.sign(event.deltaY);
          } else {
            this.data.direction += snap * Math.sign(event.deltaY);
          }
        }
        this.refresh();
      };

      // Activate listeners
      if (this.controlIcon) this.controlIcon.removeAllListeners();
      canvas.stage.on("mousemove", handlers.mm);
      canvas.stage.on("mousedown", handlers.lc);
      canvas.app.view.oncontextmenu = handlers.rc;
      canvas.app.view.onwheel = handlers.mw;
      this.hitArea = new PIXI.Polygon([]);
    });
  }

  refresh() {
    if (!this.template) return;
    if (!canvas.scene) return;

    super.refresh();

    if (this.active) {
      this.highlightGrid();
    }

    return this;
  }
}
