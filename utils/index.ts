export const venueCleanup = (venue) => {
    delete venue.cognitoId;
    delete venue.venueEmail;
    delete venue.bankBSB;
    delete venue.bankName;
    delete venue.bankAccountNo;
    delete venue.bankAccountNo;

    return venue;
}

export const userCleanup = (user) => {
    delete user.cognitoId;

    return user;
}