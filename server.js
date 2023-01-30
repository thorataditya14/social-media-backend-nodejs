// ---- ---- ---- required libraries ---- ---- ---- ---- ---- ----
const dotenv = require("dotenv")
const express = require('express')
const app = express()
const bcrypt = require('bcrypt')
const passport = require('passport')
const mongoose = require("mongoose")
const flash = require('express-flash')
const methodOverride = require('method-override')
const session = require('express-session')
const MongoStore = require('connect-mongo')
dotenv.config()
// ---------------------------------------------------------------


// ---- ---- ---- mongoogse models --- ---- ---- ---- ---- ---- ----
const User = require("./models/User")
const Post = require("./models/Post")
// ---- ---- ---- mongoogse connection ---- ---- ---- ---- ---- ----
mongoose.set('strictQuery', false)
mongoose.connect(
    process.env.MONGO_URI,
    { useNewUrlParser: true, useUnifiedTopology: true },
    () => {
        console.log("Connected to database")
    }
)
// -----------------------------------------------------------------


// ---- ---- ---- get user by username ---- ---- ---- ---- ---- ----
const getUserByUName = async (username) => {
    try {
        user = await User.findOne({ username: username })
        return user
    } catch (err) {
        console.log(err)
    }
}
// ---- ---- ---- get user by _id ---- ---- ---- ---- ---- ---- ----
const getUserById = async (id) => {
    try {
        user = await User.findOne({ _id: id })
        return user
    } catch (err) {
        console.log(err)
    }
}
// -----------------------------------------------------------------


// ---- ---- ---- initialize passport ---- ---- ---- ---- ---- ----
const initializePassport = require('./passport-config')
initializePassport(
    passport,
    getUserByUName,
    getUserById
)
// ----------------------------------------------------------------


// ---- ---- ---- middleware ---- ---- ---- ---- ---- ----
app.set('view-engine', 'ejs')
app.use(express.urlencoded({ extended: false }))
app.use(flash())
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URI })
}))
app.use(passport.initialize())
app.use(passport.session())
app.use(methodOverride('_method'))
// -------------------------------------------------------


// ---- ---- ---- verify admin function ---- ---- ---- ---- ---- ----
const verifyAdmin = (req, res, next) => {
    try {
        checkAuthenticated(req, res, async () => {
            const currentUser = await User.findById(req.session.passport.user)
            const { currentPassword, ...currUser } = currentUser._doc

            if (currUser.isAdmin)
                return next()

            res.json({ message: "you are not an admin" })
        })
    } catch (err) {
        res.json({ message: err })
    }
}
// ------------------------------------------------------------------


// ---- ---- ---- ---- routes ---- ---- ---- ---- ---- ----

// GET / : Go to current user profile
app.get('/', checkAuthenticated, async (req, res) => {
    try {
        const currentUser = await User.findById(req.session.passport.user)
        const { currentPassword, ...currUser } = currentUser._doc

        const allPosts = await Post.find({})

        res.render('index.ejs', { currUser, allPosts })
    } catch (err) {
        console.log(err)
        res.json({ message: err })
    }
})

// GET /login : Go to user login page
app.get('/login', checkNotAuthenticated, (req, res) => {
    res.render('login.ejs')
})

// POST /login : Login to user account 
app.post('/login', checkNotAuthenticated, passport.authenticate('local', {
    successRedirect: '/',
    failureRedirect: '/login',
    failureFlash: true
}))

// GET /register :  Go to user registration page
app.get('/register', checkNotAuthenticated, (req, res) => {
    res.render('register.ejs')
})

// POST /register : Create new user account
app.post('/register', checkNotAuthenticated, async (req, res) => {
    try {
        const hashedPassword = await bcrypt.hash(req.body.password, 10)
        const newUser = new User({
            email: req.body.email,
            username: req.body.username,
            password: hashedPassword,
        })
        const user = await newUser.save()
        res.redirect('/login')
    } catch {
        res.redirect('/register')
    }
})

// DELETE /logout : Logout from user account
app.delete('/logout', (req, res) => {
    req.logOut()
    res.redirect('/login')
})

// GET /users : Retrieve list of all users
app.get('/users', verifyAdmin, async (req, res) => {
    try {
        let users = await User.find({})
        !users && res.json({ message: "no users found" })

        let allUsers = []
        users.forEach((user) => {
            const { password, ...other } = user._doc
            allUsers.push(other)
        })

        res.render('users.ejs', { allUsers })
    } catch (err) {
        res.json({ message: err })
    }
})

// GET /users/:username : Retrieve a specific user by username
app.get('/users/:username', checkAuthenticated, async (req, res) => {
    try {
        const currentUser = await User.findById(req.session.passport.user)
        const { currentPassword, ...currUser } = currentUser._doc

        if (currUser.username === req.params.username)
            res.redirect('/')

        const user = await User.findOne({ username: req.params.username })
        !user && res.json({ message: `user ${req.params.username} not found` })
        const { password, ...userDetails } = user._doc

        const allPosts = await Post.find({})

        res.render('user.ejs', { userDetails, currUser, allPosts })
    } catch (err) {
        res.json({ message: err })
    }
})

// GET /users/:username/followers : Retrieve a list of followers for a specific user
app.get('/users/:username/followers', checkAuthenticated, async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username })
        !user && res.json({ message: `user ${req.params.username} not found` })
        const { password, ...userDetails } = user._doc
        res.render('followers.ejs', { userDetails })
    } catch (err) {
        res.json({ message: err })
    }
})

// GET /users/:username/following : Retrieve a list of users a specific user is following
app.get('/users/:username/following', checkAuthenticated, async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username })
        !user && res.json({ message: `user ${req.params.username} not found` })
        const { password, ...userDetails } = user._doc

        res.render('following.ejs', { userDetails })
    } catch (err) {
        console.log(err)
        res.json({ message: err })
    }
})

// POST /users/:username/follow : Follow a specific user
app.post("/users/:username/follow", checkAuthenticated, async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username })
        !user && res.json({ message: `user ${req.params.username} not found` })

        const currentUser = await User.findById(req.session.passport.user)

        await user.updateOne({ $push: { followers: currentUser.username } });
        await currentUser.updateOne({ $push: { following: user.username } });

        res.redirect(`/users/${req.params.username}`)
    } catch (err) {
        console.log(err)
        res.json({ message: err })
    }
});

// DELETE /users/:username/follow : Unfollow a specific user
app.delete("/users/:username/follow", checkAuthenticated, async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username });
        !user && res.json({ message: `user ${req.params.username} not found` })

        const currentUser = await User.findById(req.session.passport.user)

        await user.updateOne({ $pull: { followers: currentUser.username } });
        await currentUser.updateOne({ $pull: { following: user.username } });

        res.redirect(`/users/${req.params.username}`)
    } catch (err) {
        console.log(err)
        res.json({ message: err })
    }
});



// GET /posts : Get all post
app.get("/posts", checkAuthenticated, async (req, res) => {
    try {
        const allPosts = await Post.find({})
        !allPosts && res.json({ message: "no posts found" })

        const allUsers = await User.find({})

        const currentUser = await User.findById(req.session.passport.user)
        const { currentPassword, ...currUser } = currentUser._doc

        res.render('posts.ejs', { allPosts, allUsers, currUser })
    } catch (err) {
        console.log(err)
        res.json({ message: err })
    }
})

// POST /posts/new : Create a new post
app.post("/posts/new", checkAuthenticated, async (req, res) => {
    try {
        const currentUser = await User.findById(req.session.passport.user)

        const newPost = new Post({
            userId: req.session.passport.user,
            username: currentUser.username,
            caption: req.body.caption,
            img: req.body.img,
        })
        const post = await newPost.save()

        await currentUser.updateOne({ $push: { posts: post._id } });

        res.redirect(`/posts/${post._id}`)
    } catch (err) {
        res.json({ message: err })
    }
})

// GET /posts/:postId : Go to specific post
app.get("/posts/:postId", checkAuthenticated, async (req, res) => {
    try {
        const post = await Post.findById(req.params.postId)
        !post && res.json({ message: `post ${req.params.postId} not found` })

        const currentUser = await User.findById(req.session.passport.user)
        const { currentPassword, ...currUser } = currentUser._doc

        res.render("post.ejs", { post, currUser })
    } catch (err) {
        console.log(err)
        res.json({ message: err })
    }
})

// POST /posts/:postId/like : Like a post
app.post("/posts/:postId/like", checkAuthenticated, async (req, res) => {
    try {
        console.log(req.url)
        console.log(req.originalUrl)
        console.log(req.baseUrl)
        const post = await Post.findById(req.params.postId)
        !post && res.json({ message: `post ${req.params.postId} not found` });

        const currentUser = await User.findById(req.session.passport.user)
        const { currentPassword, ...currUser } = currentUser._doc
        await post.updateOne({ $push: { likes: currUser.username } });

        res.redirect(`/posts/${req.params.postId}`)
    } catch (err) {
        console.log(err)
        res.json({ message: err })
    }
})

// POST /posts/:postId/like : remove like from liked post
app.delete("/posts/:postId/like", checkAuthenticated, async (req, res) => {
    try {
        const post = await Post.findById(req.params.postId)
        !post && res.json({ message: `post ${req.params.postId} not found` });

        const currentUser = await User.findById(req.session.passport.user)
        const { currentPassword, ...currUser } = currentUser._doc

        await post.updateOne({ $pull: { likes: currUser.username } });

        res.redirect(`/posts/${req.params.postId}`)
    } catch (err) {
        console.log(err)
        res.json({ message: err })
    }
})
// --------------------------------------------------------


// ---- ---- ---- check if user is authenticated --- ---- ---- ---- ---- ----
function checkAuthenticated(req, res, next) {
    if (req.isAuthenticated())
        return next()
    res.redirect('/login')
}
// ---- ---- check if user is not authenticated ---- ---- ---- ---- ---- ----
function checkNotAuthenticated(req, res, next) {
    if (req.isAuthenticated())
        return res.redirect('/')
    next()
}
// --------------------------------------------------------------------------


// ---- ---- listen on server port ---- ---- ---- ---- ---- ----
const PORT = process.env.PORT

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})
// -------------------------------------------------------------
