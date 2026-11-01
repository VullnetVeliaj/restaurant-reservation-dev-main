const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { localRestaurantsStore } = require('./authRoutes');

/**
 * PUBLIC RESTAURANT PROFILE
 *
 * GET /api/restaurants/:restaurant_id
 *
 * No login/token required.
 * Used by booking.html and the public website.
 */

/**
 * PUBLIC RESTAURANT LIST
 *
 * GET /api/restaurants
 *
 * No login/token required.
 * Used by public homepage.
 */
router.get('/', async (req, res) => {
  try {
    let restaurants = [];

    // 1. Try Supabase first
    try {
      const listColumns = 'id, name, slug, primary_color, logo_url, created_at';
      let { data, error } = await supabase
        .from('restaurants')
        .select(`${listColumns}, cover_image_url`)
        .order('created_at', { ascending: true });

      // Before migration 2026-10-10 the cover column does not exist yet
      if (error && (error.code === '42703' || error.code === 'PGRST204' || /cover_image_url/.test(error.message || ''))) {
        ({ data, error } = await supabase
          .from('restaurants')
          .select(listColumns)
          .order('created_at', { ascending: true }));
      }

      if (error) {
        console.warn(
          '[Public Restaurants Supabase List]',
          error.message
        );
      }

      if (data && Array.isArray(data)) {
        restaurants = data;
      }

    } catch (dbError) {
      console.warn(
        '[Public Restaurants DB List Error]',
        dbError.message
      );
    }

    // 2. Local fallback
    if (!restaurants || restaurants.length === 0) {
      restaurants = Object.values(
        localRestaurantsStore
      );
    }

    return res.status(200).json({
      success: true,
      count: restaurants.length,
      restaurants: restaurants.map((restaurant) => ({
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug || restaurant.id,
        primary_color:
          restaurant.primary_color || '#D4A373',
        logo_url:
          restaurant.logo_url || null,
        cover_image_url:
          restaurant.cover_image_url || null
      }))
    });

  } catch (err) {
    console.error(
      '[GET /api/restaurants]',
      err
    );

    return res.status(500).json({
      success: false,
      error: {
        message: 'Failed to load restaurants',
        details: err.message
      }
    });
  }
});


router.get('/:restaurant_id', async (req, res) => {
  try {
    const { restaurant_id } = req.params;

    if (!restaurant_id) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Restaurant ID is required'
        }
      });
    }

    let restaurant = null;

    // --------------------------------------------------
    // 1. Try Supabase first
    // --------------------------------------------------
    try {
      const { data, error } = await supabase
        .from('restaurants')
        .select('id, name, slug, primary_color, logo_url')
        .eq('id', restaurant_id)
        .single();

      if (!error && data) {
        restaurant = data;
      }

      if (error) {
        console.warn(
          '[Public Restaurant Supabase Lookup]',
          error.message
        );
      }
    } catch (dbError) {
      console.warn(
        '[Public Restaurant DB Error]',
        dbError.message
      );
    }

    // --------------------------------------------------
    // 2. Demo/local fallback
    // --------------------------------------------------
    if (!restaurant && localRestaurantsStore[restaurant_id]) {
      restaurant = localRestaurantsStore[restaurant_id];
    }

    // --------------------------------------------------
    // 3. Restaurant does not exist
    // --------------------------------------------------
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Restaurant not found'
        }
      });
    }

    // --------------------------------------------------
    // 4. Return ONLY public information
    // --------------------------------------------------
    return res.status(200).json({
      success: true,
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug || restaurant.id,
        primary_color:
          restaurant.primary_color || '#D4A373',
        logo_url:
          restaurant.logo_url || null
      }
    });

  } catch (err) {
    console.error(
      '[GET /api/restaurants/:restaurant_id]',
      err
    );

    return res.status(500).json({
      success: false,
      error: {
        message: 'Failed to load restaurant',
        details: err.message
      }
    });
  }
});

module.exports = router;