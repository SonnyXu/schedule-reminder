var mongoose = require('mongoose');
if (! process.env.MONGODB_URI) {
  console.log('Error: MONGODB_URI is not set. Did you run source env.sh ?');
  process.exit(1);
}
var connect = process.env.MONGODB_URI;
mongoose.connect(connect);


var userSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
  },
  token: {
    type: String,
    required: true
  }
});


var User = mongoose.model('User', userSchema);

module.exports = {
  User: User
}
