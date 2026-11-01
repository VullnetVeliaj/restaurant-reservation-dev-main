const reservationService = require('../services/reservationService');

class ReservationController {
  async getAll(req, res, next) {
    try {
      const { date, status } = req.query;
      const reservations = await reservationService.getAllReservations({ date, status });
      res.json({
        success: true,
        data: reservations
      });
    } catch (err) {
      next(err);
    }
  }

  async getById(req, res, next) {
    try {
      const { id } = req.params;
      const reservation = await reservationService.getReservationById(id);
      if (!reservation) {
        return res.status(404).json({
          success: false,
          error: { message: 'Reservation not found' }
        });
      }
      res.json({
        success: true,
        data: reservation
      });
    } catch (err) {
      next(err);
    }
  }

  async create(req, res, next) {
    try {
      const { customer_name, customer_email, customer_phone, party_size, reservation_date, reservation_time, table_id, special_requests } = req.body;

      if (!customer_name || !party_size || !reservation_date || !reservation_time) {
        return res.status(400).json({
          success: false,
          error: { message: 'customer_name, party_size, reservation_date, and reservation_time are required.' }
        });
      }

      const newReservation = await reservationService.createReservation({
        customer_name,
        customer_email,
        customer_phone,
        party_size,
        reservation_date,
        reservation_time,
        table_id,
        special_requests
      });

      res.status(201).json({
        success: true,
        data: newReservation
      });
    } catch (err) {
      next(err);
    }
  }

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const updated = await reservationService.updateReservation(id, req.body);
      res.json({
        success: true,
        data: updated
      });
    } catch (err) {
      next(err);
    }
  }

  async cancel(req, res, next) {
    try {
      const { id } = req.params;
      const cancelled = await reservationService.cancelReservation(id);
      res.json({
        success: true,
        message: 'Reservation cancelled successfully',
        data: cancelled
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new ReservationController();
