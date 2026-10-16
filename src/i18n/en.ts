import type hu from './hu';
const en:Record<keyof typeof hu,string>={
brand:'HATÁRVILÁG',subtitle:'Command terminal',language:'Language',explore:'Explore',command:'Command',survive:'Survive',
status:'System status',ready:'Communication network ready',notice:'Galactic transmission',noticeBody:'New horizons await. The frontier is in your hands.',
login:'Log in',register:'Register',create:'Create account',email:'Email address',password:'Password',repeat:'Repeat password',name:'Commander name',
forgot:'Forgot password?',recover:'Password recovery',send:'Send reset email',back:'Back to login',
passwordShort:'Password must be at least eight characters.',passwordMismatch:'Passwords do not match.',invalid:'Invalid email or password.',
verify:'Check your inbox to verify your new account.',sent:'If this account exists, a recovery email has been sent.',
working:'Working…',loading:'Loading…',error:'Something went wrong. Please try again.',signout:'Log out',welcome:'Welcome to the frontier',
dashboard:'Overview',editor:'Content editor',admin:'Administration',user:'Player',role:'Role',
description:'The galactic game and energy regeneration are under development.',editorText:'Content editing will be added here. This section is role protected.',
adminText:'View permissions. Roles can only be changed through a trusted server-side procedure.',
noAccess:'You do not have access to this section.',users:'Users',noUsers:'No users available.',
profileError:'Failed to load permissions.',retry:'Try again',settings:'Language settings',change:'Change password',changed:'Password changed. Please log in again.',footer:'Connection established // Határvilág v0.1'
};export default en;
