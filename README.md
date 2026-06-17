# 🌉 Donation Bridge

**An AI-Powered Donation Platform with Real-Time Tracking and Live Communication**

---

## 📋 Project Overview

**Donation Bridge** is a comprehensive donation management platform designed to connect donors with charitable causes and organizations. It features an intelligent AI chatbot, real-time tracking of donations, secure authentication, and live communication capabilities powered by Socket.io.

The platform enables:
- **Donors** to make secure contributions and track their impact
- **Organizations** to manage campaigns and recipient resources
- **Admins** to oversee the entire donation ecosystem
- **Real-time updates** using Socket.io for live donation tracking

---

## ✨ Key Features

### 🔐 **Authentication & Security**
- User registration and login with JWT authentication
- Password encryption using bcryptjs
- Role-based access control (Donor, Organization, Admin)

### 💝 **Donation Management**
- Multiple payment options and donation tracking
- Campaign management and resource allocation
- Real-time donation notifications
- Donation history and analytics

### 🤖 **AI-Powered Chatbot**
- Intelligent donation assistance
- FAQ support and guidance
- Natural language processing for user queries

### 📡 **Real-Time Communication**
- Socket.io integration for live updates
- Real-time donation tracking dashboard
- Instant notifications for donors and organizations

### 📸 **Media Management**
- Image upload and storage using Cloudinary
- Campaign media and organization branding

### 📧 **Email & SMS Notifications**
- Transactional emails via Nodemailer
- SMS alerts using Twilio integration

### 🗄️ **Database**
- MongoDB for flexible data storage
- Mongoose ODM for schema management

---

## 🛠️ Tech Stack

### **Backend**
- **Node.js** & **Express.js** - Server framework
- **MongoDB** & **Mongoose** - Database
- **Socket.io** - Real-time communication
- **JWT** - Authentication
- **bcryptjs** - Password hashing
- **Cloudinary** - Image storage
- **Nodemailer** - Email service
- **Twilio** - SMS service
- **Multer** - File upload handling

### **Frontend**
- React.js (referenced in Socket.io CORS configuration)

---

## 📦 Installation

### Prerequisites
- Node.js (v14 or higher)
- MongoDB instance
- npm or yarn

### Setup Instructions

1. **Clone the repository**
   ```bash
   git clone https://github.com/vaibhavi-2885/Donation_Bridge.git
   cd Donation_Bridge
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   Create a `.env` file in the root directory:
   ```
   PORT=5000
   MONGO_URI=mongodb://localhost:27017/donation_bridge
   JWT_SECRET=your_secret_key
   CLOUDINARY_API_KEY=your_cloudinary_key
   CLOUDINARY_API_SECRET=your_cloudinary_secret
   TWILIO_ACCOUNT_SID=your_twilio_sid
   TWILIO_AUTH_TOKEN=your_twilio_token
   NODEMAILER_USER=your_email@gmail.com
   NODEMAILER_PASS=your_email_password
   ```

4. **Start the server**
   ```bash
   npm start
   ```

   Or with nodemon for development:
   ```bash
   npm run dev
   ```

   The server will run on `http://localhost:5000`

---

## 🏗️ Project Structure

```
Donation_Bridge/
├── backend/
│   ├── index.js                 # Main server file
│   ├── routes/
│   │   ├── authRoutes.js        # Authentication endpoints
│   │   ├── adminRoutes.js       # Admin management
│   │   ├── donationRoutes.js    # Donation endpoints
│   │   └── chatbotRoutes.js     # AI chatbot endpoints
│   ├── models/                  # MongoDB schemas
│   ├── controllers/             # Route controllers
│   └── middleware/              # Custom middleware
├── frontend/                    # React frontend (if applicable)
├── package.json                 # Dependencies
└── .env                         # Environment variables
```

---

## 🚀 API Endpoints

### **Authentication**
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout

### **Donations**
- `POST /api/donations/create` - Create a donation
- `GET /api/donations` - Get all donations
- `GET /api/donations/:id` - Get donation details

### **Admin**
- `GET /api/admin/dashboard` - Admin dashboard
- `GET /api/admin/reports` - Donation reports

### **Chatbot**
- `POST /api/chatbot/query` - Send chatbot query

---

## 📡 Real-Time Features

The application uses **Socket.io** for real-time communication:

```javascript
// Client-side: Join user room for updates
socket.emit('join_user_room', userId);

// Server broadcasts donation updates
io.to(userId).emit('donation_update', donationData);
```

---

## 🔒 Security Features

- JWT token-based authentication
- Password hashing with bcryptjs
- CORS protection
- Environment variable configuration
- Role-based access control

---

## 📚 Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| express | ^5.2.1 | Web framework |
| mongoose | ^9.3.2 | Database ODM |
| socket.io | ^4.8.3 | Real-time communication |
| jsonwebtoken | ^9.0.3 | JWT authentication |
| bcryptjs | ^3.0.3 | Password hashing |
| cloudinary | ^2.9.0 | Image storage |
| nodemailer | ^8.0.4 | Email service |
| twilio | ^5.13.1 | SMS service |
| multer | ^2.1.1 | File upload |
| cors | ^2.8.6 | Cross-origin requests |
| dotenv | ^17.3.1 | Environment variables |

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📝 License

This project is licensed under the ISC License - see the `package.json` file for details.

---

## 👤 Author

**Vaibhavi Mahajan** (@vaibhavi-2885)

---

## 📧 Support

For support, email or open an issue on the GitHub repository.

---

## 🎯 Roadmap

- [ ] Advanced analytics dashboard
- [ ] Mobile app (React Native)
- [ ] Payment gateway integration
- [ ] Blockchain verification for transparency
- [ ] Multi-language support
- [ ] Machine learning for donation recommendations

---

## ⭐ Show Your Support

Give a ⭐️ if you like this project!
