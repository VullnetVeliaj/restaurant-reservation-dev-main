const express = require('express');
const router = express.Router();

const supabase = require('../config/supabase');

router.get('/widget/:widgetKey', async (req, res) => {
  try {
    const { widgetKey } = req.params;

    const { data: restaurant, error } = await supabase
      .from('restaurants')
      .select(`
        id,
        name,
        slug,
        logo_url,
        primary_color
      `)
      .eq('public_widget_key', widgetKey)
      .maybeSingle();

    if (error) {
      console.error('[Public Widget Lookup Error]', error);

      return res.status(500).json({
        success: false,
        error: {
          message: 'Restaurant konnte nicht geladen werden.'
        }
      });
    }

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Widget nicht gefunden.'
        }
      });
    }

    return res.status(200).json({
      success: true,
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        logo_url: restaurant.logo_url,
        primary_color: restaurant.primary_color
      }
    });

  } catch (err) {
    console.error('[Public Widget Error]', err);

    return res.status(500).json({
      success: false,
      error: {
        message: 'Widget konnte nicht geladen werden.'
      }
    });
  }
});

/**
 * GET /api/public/booking/:slug
 * Public booking page (/book/:slug): resolves the restaurant by its public slug
 * and returns its public widget key. The internal restaurant id is not exposed;
 * availability and booking are resolved server-side from the widget key.
 */
router.get('/booking/:slug', async (req, res) => {
  try {
    const { data: restaurant, error } = await supabase
      .from('restaurants')
      .select('name, slug, logo_url, primary_color, public_widget_key')
      .eq('slug', req.params.slug)
      .maybeSingle();

    if (error) {
      console.error('[Public Booking Lookup Error]', error);
      return res.status(500).json({
        success: false,
        error: { message: 'Restaurant konnte nicht geladen werden.' }
      });
    }

    if (!restaurant || !restaurant.public_widget_key) {
      return res.status(404).json({
        success: false,
        error: { message: 'Restaurant nicht gefunden.' }
      });
    }

    return res.status(200).json({
      success: true,
      restaurant: {
        name: restaurant.name,
        slug: restaurant.slug,
        logo_url: restaurant.logo_url,
        primary_color: restaurant.primary_color,
        public_widget_key: restaurant.public_widget_key
      }
    });
  } catch (err) {
    console.error('[Public Booking Error]', err);
    return res.status(500).json({
      success: false,
      error: { message: 'Restaurant konnte nicht geladen werden.' }
    });
  }
});

module.exports = router;
