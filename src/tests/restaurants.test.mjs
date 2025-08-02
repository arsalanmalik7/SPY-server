import axios from 'axios';
import { expect } from 'chai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load test environment variables
dotenv.config({ path: path.join(__dirname, '../../.env.test') });

const API_URL = `${process.env.FRONTEND_URL || 'http://localhost:5000'}/api`;

// Increase timeout for all tests
describe('Restaurants API Tests', function () {
    this.timeout(30000); // Set timeout to 30 seconds

    let authToken;
    let testUserId;
    let testRestaurantId;
    
    before(async () => {
        try {
            console.log('Starting test setup...');
            console.log('API URL:', API_URL);
            console.log('Test user email:', process.env.TEST_USER_EMAIL);

            // First, log in with a real user to get a valid token and user ID
            const loginResponse = await axios.post(`${API_URL}/users/login`, {
                email: "johndoe@super_admin.com", // Use super_admin account
                password: "password123" // Default password for testing
            });

            if (!loginResponse.data.accessToken) {
                throw new Error('No access token received from login');
            }

            authToken = loginResponse.data.accessToken;
            console.log('Successfully logged in and received token');
            
            // Extract user ID from the token
            const decodedToken = jwt.decode(authToken);
            testUserId = decodedToken.uuid;
            
            if (!testUserId) {
                console.log('Could not extract user ID from token, using placeholder');
                testUserId = 'test-user-id';
            }
            
            console.log('Using test user ID:', testUserId);

            // Create a test restaurant for all tests to use
            try {
                const timestamp = Date.now();
                const createData = {
                    name: `Test Restaurant ${timestamp}`,
                    address: {
                        street: "123 Test St",
                        city: "Test City",
                        state: "TS",
                        zip: "12345"
                    },
                    directors: [],
                    managers: [],
                    employees: [],
                    subscription_status: "active",
                    subscription_plan: "Single",
                    subscription_history: [{
                        plan: "Single",
                        start_date: new Date(),
                        end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
                    }],
                    allow_manager_modifications: false,
                    food_type: ["American", "Contemporary"],
                    current_wines: [],
                    previous_wines: [],
                    current_dishes: [],
                    previous_dishes: []
                };

                const createResponse = await axios.post(`${API_URL}/restaurants/create`, createData, {
                    headers: { Authorization: `Bearer ${authToken}` }
                });
                testRestaurantId = createResponse.data.restaurant.uuid;
                console.log('Created test restaurant with ID:', testRestaurantId);
            } catch (error) {
                console.error('Error creating test restaurant:', error.message);
                if (error.response) {
                    console.error('Response data:', error.response.data);
                    console.error('Response status:', error.response.status);
                }
                // If we can't create a restaurant, use a placeholder
                console.log('Could not create a restaurant. Using placeholder restaurant ID.');
                testRestaurantId = 'test-restaurant-id';
            }
        } catch (error) {
            console.error('Setup error details:', {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status,
                url: error.config?.url,
                method: error.config?.method
            });
            throw error;
        }
    });

    describe('GET /restaurants', () => {
        it('should get all restaurants', async () => {
            try {
                const response = await axios.get(`${API_URL}/restaurants`, {
                    headers: { Authorization: `Bearer ${authToken}` }
                });
                expect(response.status).to.equal(200);
                expect(response.data).to.be.an('array');
            } catch (error) {
                console.error('Error getting restaurants:', error.message);
                if (error.response) {
                    console.error('Response data:', error.response.data);
                }
                throw error;
            }
        });
    });

    describe('GET /restaurants/:id', () => {
        it('should get a restaurant by ID', async () => {
            try {
                const response = await axios.get(`${API_URL}/restaurants/${testRestaurantId}`, {
                    headers: { Authorization: `Bearer ${authToken}` }
                });
                expect(response.status).to.equal(200);
                expect(response.data).to.be.an('object');
                expect(response.data.uuid).to.equal(testRestaurantId);
            } catch (error) {
                console.error('Error getting restaurant by ID:', error.message);
                if (error.response) {
                    console.error('Response data:', error.response.data);
                }
                throw error;
            }
        });

        it('should return 404 for non-existent restaurant', async () => {
            try {
                await axios.get(`${API_URL}/restaurants/non-existent-id`, {
                    headers: { Authorization: `Bearer ${authToken}` }
                });
                throw new Error('Expected 404 error but got success');
            } catch (error) {
                expect(error.response.status).to.equal(404);
                expect(error.response.data).to.have.property('message');
            }
        });
    });

    describe('POST /restaurants/create', () => {
        it('should create a new restaurant', async () => {
            try {
                const timestamp = Date.now();
                const createData = {
                    name: `New Test Restaurant ${timestamp}`,
                    address: {
                        street: "456 New Test St",
                        city: "New Test City",
                        state: "NTS",
                        zip: "67890"
                    },
                    directors: [],
                    managers: [],
                    employees: [],
                    subscription_status: "active",
                    subscription_plan: "Single",
                    subscription_history: [{
                        plan: "Single",
                        start_date: new Date(),
                        end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
                    }],
                    allow_manager_modifications: false,
                    food_type: ["Italian", "Modern"],
                    current_wines: [],
                    previous_wines: [],
                    current_dishes: [],
                    previous_dishes: []
                };

                const response = await axios.post(`${API_URL}/restaurants/create`, createData, {
                    headers: { Authorization: `Bearer ${authToken}` }
                });
                expect(response.status).to.equal(201);
                expect(response.data).to.be.an('object');
                expect(response.data.restaurant).to.be.an('object');
                expect(response.data.restaurant.name).to.equal(createData.name);
            } catch (error) {
                console.error('Error creating restaurant:', error.message);
                if (error.response) {
                    console.error('Response data:', error.response.data);
                }
                throw error;
            }
        });
    });

    describe('PUT /restaurants/:id', () => {
        it('should update a restaurant', async () => {
            try {
                const updateData = {
                    name: "Updated Test Restaurant",
                    address: {
                        street: "789 Updated St",
                        city: "Updated City",
                        state: "US",
                        zip: "54321"
                    }
                };

                const response = await axios.put(`${API_URL}/restaurants/${testRestaurantId}`, updateData, {
                    headers: { Authorization: `Bearer ${authToken}` }
                });
                expect(response.status).to.equal(200);
                expect(response.data).to.be.an('object');
                expect(response.data.uuid).to.equal(testRestaurantId);
            } catch (error) {
                console.error('Error updating restaurant:', error.message);
                if (error.response) {
                    console.error('Response data:', error.response.data);
                }
                throw error;
            }
        });
    });

    describe('DELETE /restaurants/:id', () => {
        it('should delete a restaurant', async () => {
            try {
                const response = await axios.delete(`${API_URL}/restaurants/${testRestaurantId}`, {
                    headers: { Authorization: `Bearer ${authToken}` }
                });
                expect(response.status).to.equal(200);
                expect(response.data).to.have.property('message');
            } catch (error) {
                console.error('Error deleting restaurant:', error.message);
                if (error.response) {
                    console.error('Response data:', error.response.data);
                }
                throw error;
            }
        });
    });

    describe('GET /restaurants/director/:directorId/restaurants', () => {
        it('should get restaurants managed by a director', async () => {
            try {
                const response = await axios.get(`${API_URL}/restaurants/director/${testUserId}/restaurants`, {
                    headers: { Authorization: `Bearer ${authToken}` }
                });
                expect(response.status).to.equal(200);
                expect(response.data).to.be.an('array');
            } catch (error) {
                console.error('Error getting director restaurants:', error.message);
                if (error.response) {
                    console.error('Response data:', error.response.data);
                }
                throw error;
            }
        });
    });
});