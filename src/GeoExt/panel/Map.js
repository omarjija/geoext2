/**
 * @class GeoExt.panel.Map
 */
Ext.define('GeoExt.panel.Map', {
    extend : 'Ext.panel.Panel',
    requires : [
    //    'GeoExt.data.LayerStore'
    ],
    alias : 'widget.gx_mappanel',
    alternateClassName : 'GeoExt.MapPanel',
    
    statics : {
        guess : function() {
            var candidates = Ext.ComponentQuery.query("gx_mappanel");
            return ((candidates && candidates.length > 0) 
                ? candidates[0] 
                : null);
        }
    },
    
    config: {
        /**
         * @cfg {OpenLayers.Map/Object} map
         * A configured map or a configuration object for the map constructor.
         * A configured map will be available after construction through the
         * {@link #map} property.
         */
        map: null,
        
        /**
         * @cfg {OpenLayers.Layer[]}
         * The layers provided here will be added to this MapPanel's map.
         */
        
        /**
         * @property {GeoExt.data.store.layer} layers
         * A store containing gx_layer-model instances.
         */
        layers: null,
        
        /** @cfg {OpenLayers.LonLat/Number[]/String} mapCenter
         * A location for the initial map center.  If an array is provided, the
         * first two items should represent x & y coordinates. If a string is
         * provided, it should consist of a x & y coordinate seperated by a 
         * comma.
         */
        mapCenter: null,
        
        /**
         * @cfg {Number} mapZoom
         * An initial zoom level for the map.
         */
        mapZoom: null,
        
        /**
         * @cfg {OpenLayers.Bounds/Number[]} mapExtent
         * An initial extent for the map (used if center and zoom are not
         * provided.  If an array, the first four items should be minx, miny,
         * maxx, maxy.
         */
        mapExtent: null,
        
        /** 
         * @cfg {Boolean} prettyStateKeys
         * Set this to true if you want pretty strings in the MapPanel's state
         * keys. More specifically, layer.name instead of layer.id will be used
         * in the state keys if this option is set to true. But in that case
         * you have to make sure you don't have two layers with the same name.
         * Defaults to false.
         */
        prettyStateKeys: false
    },
    
    /**
     * @property {String[]} stateEvents
     * @private
     * Array of state events
     */
    stateEvents: ["aftermapmove",
                  "afterlayervisibilitychange",
                  "afterlayeropacitychange",
                  "afterlayerorderchange",
                  "afterlayernamechange",
                  "afterlayeradd",
                  "afterlayerremove"],
    
    initComponent: function(){
        var me = this;
        
        // check config-property map for an existing OpenLayers.Map-instance, a
        // conf object for an OpenLayers.Map or null
        if ( !(me.map instanceof OpenLayers.Map) ) {
            var mapConf = Ext.applyIf(me.map || {}, {
                allOverlays: true,
                controls: me.initialConfig.controls || me.getDefaultControls()
            });
            me.map = new OpenLayers.Map(mapConf);
        } else {
            // add any additionally configured controls:
            if (me.initialConfig.controls) {
                me.map.addControls(me.initialConfig.controls);
            }
        }
        // this.map is now initialized in any case and has needed and
        // configured controls
        
        // check config-property layers for any layers to be added to the map
        if ( me.layers ) {
            // normalize the case where this.layers was not an array but a layer 
            if(me.layers instanceof OpenLayers.Layer) {
                me.layers = [me.layers];
            }
            
            //TODO: this possibly requests data from the layers to early
            // we might move this e.g. to the renderMap-method
            me.map.addLayers(me.layers);
            
        }

        // create a layerstore with the current maps layers
        me.layers = Ext.create('GeoExt.data.store.Layer', {
            data: me.map.layers
        });
        
        // check config-property controls
        if ( me.controls ) {
            // normalize the case where this.controls was not an array but a control 
            if(me.controls instanceof OpenLayers.Control) {
                me.controls = [me.controls];
            }
            me.map.addControls(me.controls);
        }
        
        // check config-property center
        if ( Ext.isString(me.mapCenter) ) {
            me.mapCenter = OpenLayers.LonLat.fromString(me.mapCenter);
        } else if(Ext.isArray(me.mapCenter)) {
            // see: http://trac.osgeo.org/openlayers/ticket/3433
            // me.center = OpenLayers.LonLat.fromArray(me.center);
            me.mapCenter = new OpenLayers.LonLat(me.mapCenter[0], me.mapCenter[1]); 
        } 
        
        // check config-property bounds
        if ( Ext.isString(me.mapExtent) ) {
            me.mapExtent = OpenLayers.Bounds.fromString(me.mapExtent);
        } else if(Ext.isArray(me.mapExtent)) {
            me.mapExtent = OpenLayers.Bounds.fromArray(me.mapExtent);
        }
        
        me.callParent(arguments);
        
        me.addEvents(
            /**
             * @event
             * Fires after the map is moved.
             */
            "aftermapmove",

            /**
             * @event
             * Fires after a layer changed visibility.
             */
            "afterlayervisibilitychange",

            /**
             * @event
             * Fires after a layer changed opacity.
             */
            "afterlayeropacitychange",

            /**
             * @event
             * Fires after a layer order changed.
             */
            "afterlayerorderchange",

            /**
             * @event
             * Fires after a layer name changed.
             */
            "afterlayernamechange",

            /**
             * @event
             * Fires after a layer added to the map.
             */
            "afterlayeradd",

            /**
             * @event
             * Fires after a layer removed from the map.
             */
            "afterlayerremove"
        );
        
        // bind various listeners to the corresponding OpenLayers.Map-events
        me.map.events.on({
            "moveend": me.onMoveend,
            "changelayer": me.onChangelayer,
            "addlayer": me.onAddlayer,
            "removelayer": me.onRemovelayer,
            scope: me
        });
        
    },
    
    /**
     * @private
     */
    getDefaultControls: function() {
        var olc = OpenLayers.Control;
        return [
            new olc.Attribution(),
            new olc.ArgParser(),
            new olc.Navigation()
        ];
    },
    
    afterRender: function(){
        var me = this;
        me.callParent(arguments);
        if(!me.ownerCt) {
            me.renderMap();
        } else {
            this.ownerCt.on("move", me.updateMapSize, me);
            this.ownerCt.on({
                "afterlayout": me.renderMap,
                scope: me
            });
        }
    },
    
    updateMapSize: function() {
        var map = this.getMap();
        if(map) {
            map.updateSize();
        }
    },
    
    adjustGeographicPosition: function(){
        var me = this,
            map = me.getMap();
        // Adjust the geographic position according to the passed config-options 
        if (!map.getCenter()) {
            if (me.getMapCenter() || me.getMapZoom() ) {
                // center and/or zoom?
                map.setCenter(me.getMapCenter(), me.getMapZoom());
            } else if (me.getMapExtent() instanceof OpenLayers.Bounds) {
                // extent
                map.zoomToExtent(me.getMapExtent(), true);
            }else { 
                map.zoomToMaxExtent();
            }    
        }
    },
    
    renderMap: function() {
        var me = this,
            map = me.getMap();
        if (me.hasRenderableSize()) {
            map.render(me.body.dom);
            me.adjustGeographicPosition();
        }
    },
    
    hasRenderableSize: function() {
        var me = this,
            size = me.getSize(),
            width = (size.width === 0) 
                  ? 0 
                  : size.width - me.body.getBorderWidth("lr"),
            height = (size.height === 0) 
                  ? 0 
                  : size.height - me.body.getBorderWidth("tb");
        // console.log('w:' + width + ',h:' + height);
        return (width > 0 || height > 0);
        
    },
    
    /**
     * @private
     * The "moveend" listener bound to the {@link map}.
     */
    onMoveend: function(e) {
        this.fireEvent("aftermapmove", this, this.getMap(), e);
    },

    /**
     * @private
     * @param {Object} e
     * The "changelayer" listener bound to the {@link map}.
     */
    onChangelayer: function(e) {
        var me = this,
            map = me.getMap();
        if (e.property) {
            if (e.property === "visibility") {
                me.fireEvent("afterlayervisibilitychange", this, map, e);
            } else if (e.property === "order") {
                me.fireEvent("afterlayerorderchange", this, map, e);
            } else if (e.property === "name") {
                me.fireEvent("afterlayernamechange", this, map, e);
            } else if (e.property === "opacity") {
                me.fireEvent("afterlayeropacitychange", this, map, e);
            }
        }
    },

    /**
     * @private
     * The "addlayer" listener bound to the {@link map}.
     */
    onAddlayer: function(e) {
        this.layers.load();
        this.fireEvent("afterlayeradd", this, this.getMap(), e);
    },

    /**
     * @private
     * The "removelayer" listener bound to the {@link map}.
     */
    onRemovelayer: function(e) {
        this.layers.load();
        this.fireEvent("afterlayerremove", this, this.getMap(), e);
    },
    
    getState: function() {
        var me = this,
            map = me.getMap(),
            state = me.callParent(arguments),
            layer;

        // Ext delays the call to getState when a state event
        // occurs, so the MapPanel may have been destroyed
        // between the time the event occurred and the time
        // getState is called
        if(!map) {
            return;
        }

        // record location and zoom level
        var center = map.getCenter();
        // map may not be centered yet, because it may still have zero
        // dimensions or no layers
        
        if (center)  {
            state = me.addPropertyToState(state, 'x', center.lon);
            state = me.addPropertyToState(state, 'y', center.lat);
            state = me.addPropertyToState(state, 'zoom', map.getZoom());
        }
        
        me.layers.each(function(modelInstance) {
            layer = modelInstance.getLayer();
            layerId = this.prettyStateKeys 
                   ? modelInstance.get('name') 
                   : modelInstance.get('id');
            state = me.addPropertyToState(state, "visibility_" + layerId, 
                layer.getVisibility());
            state = me.addPropertyToState(state, "opacity_" + layerId, 
                (layer.opacity === null) ? 1 : layer.opacity);
        }, me);
        
        return state;  
    },
    
    /**
     * @private
     * @param {Object} state The state to apply.
     * Apply the state provided as an argument.
     */
    applyState: function(state) {
        var me = this;
            map = me.getMap();
        // if we get strings for state.x, state.y or state.zoom
        // OpenLayers will take care of converting them to the
        // appropriate types so we don't bother with that
        me.mapCenter = new OpenLayers.LonLat(state.x, state.y);
        me.mapZoom = state.zoom;
        
        // TODO refactor with me.layers.each
        // set layer visibility and opacity
        var i, l, layer, layerId, visibility, opacity;
        var layers = map.layers;
        for(i=0, l=layers.length; i<l; i++) {
            layer = layers[i];
            layerId = me.prettyStateKeys ? layer.name : layer.id;
            visibility = state["visibility_" + layerId];
            if(visibility !== undefined) {
                // convert to boolean
                visibility = (/^true$/i).test(visibility);
                if(layer.isBaseLayer) {
                    if(visibility) {
                        map.setBaseLayer(layer);
                    }
                } else {
                    layer.setVisibility(visibility);
                }
            }
            opacity = state["opacity_" + layerId];
            if(opacity !== undefined) {
                layer.setOpacity(opacity);
            }
        }
    },

    
    /**
     * @private
     * Private method called during the destroy sequence.
     */
    beforeDestroy: function() {
        me = this;
        if(this.ownerCt) {
            this.ownerCt.un("move", this.updateMapSize, this);
        }
        if(this.map && this.map.events) {
            this.map.events.un({
                "moveend": this.onMoveend,
                "changelayer": this.onChangelayer,
                "addlayer": this.onAddlayer,
                "removelayer": this.onRemovelayer,
                scope: this
            });
        }
        // if the map panel was passed a map instance, this map instance
        // is under the user's responsibility
        if(!this.initialConfig.map ||
           !(this.initialConfig.map instanceof OpenLayers.Map)) {
            // we created the map, we destroy it
            if(this.map && this.map.destroy) {
                this.map.destroy();
            }
        }
        delete this.map;
        me.callParent(arguments);
    }
});
